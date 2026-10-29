use std::cell::{Cell, RefCell};
use std::ptr::NonNull;
use std::time::{SystemTime, UNIX_EPOCH};

use block2::{DynBlock, RcBlock};
use objc2::rc::{Retained, Weak};
use objc2::runtime::{
	AnyObject, NSObject, NSObjectProtocol, ProtocolObject, Sel,
};
use objc2::{
	define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_foundation::{
	NSArray, NSError, NSNotification, NSNotificationCenter, NSNotificationName,
	NSNumber, NSOperationQueue, NSString, NSValue,
};
use objc2_ui_kit::{
	NSValueUIGeometryExtensions, UICoordinateSpace,
	UIKeyboardAnimationCurveUserInfoKey,
	UIKeyboardAnimationDurationUserInfoKey,
	UIKeyboardDidChangeFrameNotification, UIKeyboardDidShowNotification,
	UIKeyboardFrameEndUserInfoKey, UIKeyboardIsLocalUserInfoKey,
	UIKeyboardWillChangeFrameNotification, UIKeyboardWillHideNotification,
	UIKeyboardWillShowNotification, UIResponder, UIScrollView,
	UIScrollViewKeyboardDismissMode, UIView, UIViewAutoresizing, UIWindow,
};
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::WebviewWindow;

use super::geometry::{
	self, Edges, KeyboardMotion, NativeInsets, PagePoint, Rect,
};

type Observer = Retained<ProtocolObject<dyn NSObjectProtocol>>;

const OPEN_LEAD_MS: f64 = 20.0;
const CLOSE_LEAD_MS: f64 = 3.0;
const SHORTEST_CLOSE_SECONDS: f64 = 0.35;

thread_local! {
	static DRIVER: RefCell<Option<Driver>> = const { RefCell::new(None) };
}

struct Driver {
	frame: Retained<KeyboardFrame>,
	_observers: Vec<Observer>,
}

struct Placement {
	webview: Weak<UIView>,
	keyboard: Cell<CGRect>,
	page_follows: Cell<bool>,
	travelled: Cell<f64>,
	opening: Cell<Option<Timing>>,
	sent: Cell<Option<NativeInsets>>,
	drag_target: Cell<Option<CGPoint>>,
	drag_scroller: RefCell<Option<Weak<UIScrollView>>>,
}

#[derive(Clone, Copy)]
struct Timing {
	duration: f64,
	curve: usize,
}

struct KeyboardChange {
	end: CGRect,
	timing: Timing,
}

define_class!(
	#[unsafe(super(UIView, UIResponder, NSObject))]
	#[thread_kind = MainThreadOnly]
	#[name = "OpenGrindKeyboardFrame"]
	#[ivars = Placement]
	struct KeyboardFrame;

	impl KeyboardFrame {
		#[unsafe(method(layoutSubviews))]
		fn layout_subviews(&self) {
			let _: () = unsafe { msg_send![super(self), layoutSubviews] };
			self.place();
		}

		#[unsafe(method(safeAreaInsetsDidChange))]
		fn safe_area_insets_did_change(&self) {
			let _: () =
				unsafe { msg_send![super(self), safeAreaInsetsDidChange] };
			self.setNeedsLayout();
		}

		#[unsafe(method(startKeyboardOpening))]
		fn start_keyboard_opening(&self) {
			if let Some(timing) = self.ivars().opening.take() {
				self.ride(timing, OPEN_LEAD_MS);
			}
		}
	}
);

impl KeyboardFrame {
	fn new(
		mtm: MainThreadMarker,
		webview: &UIView,
		frame: CGRect,
	) -> Retained<Self> {
		let this = Self::alloc(mtm).set_ivars(Placement {
			webview: Weak::new(webview),
			keyboard: Cell::new(CGRect::ZERO),
			page_follows: Cell::new(false),
			travelled: Cell::new(0.0),
			opening: Cell::new(None),
			sent: Cell::new(None),
			drag_target: Cell::new(None),
			drag_scroller: RefCell::new(None),
		});
		unsafe { msg_send![super(this), initWithFrame: frame] }
	}

	fn place(&self) {
		let Some(webview) = self.ivars().webview.load() else {
			return;
		};
		let overlap = self.keyboard_overlap();
		let page_follows = self.ivars().page_follows.get();
		if page_follows {
			self.catch_up(overlap);
		}
		let safe = self.safeAreaInsets();
		let safe = Edges {
			top: safe.top,
			bottom: safe.bottom,
			left: safe.left,
			right: safe.right,
		};
		let insets = if page_follows {
			geometry::followed_insets(safe, overlap)
		} else {
			geometry::insets(safe, overlap)
		};
		if self.ivars().sent.get() != Some(insets) {
			self.ivars().sent.set(Some(insets));
			evaluate(&webview, &geometry::push_script(&insets));
		}
		let covered = if page_follows { 0.0 } else { overlap };
		let frame = self.frame();
		webview.setFrame(CGRect {
			origin: frame.origin,
			size: CGSize {
				width: frame.size.width,
				height: frame.size.height - covered,
			},
		});
		if page_follows && overlap > 0.0 {
			self.aim_drag_dismiss();
		}
	}

	fn keyboard_overlap(&self) -> f64 {
		let Some(window) = self.window() else {
			return 0.0;
		};
		if presenting(&window) {
			return 0.0;
		}
		let keyboard = self.convertRect_fromCoordinateSpace(
			self.ivars().keyboard.get(),
			&window.screen().coordinateSpace(),
		);
		geometry::keyboard_overlap(rect(self.bounds()), rect(keyboard))
	}

	fn keyboard_will_change(&self, change: KeyboardChange) {
		self.ivars().keyboard.set(change.end);
		if !self.ivars().page_follows.get() {
			self.setNeedsLayout();
			self.layoutIfNeeded();
			return;
		}
		let overlap = self.keyboard_overlap();
		let travelled = self.ivars().travelled.get();
		if overlap < travelled {
			self.ivars().opening.set(None);
			let mut timing = change.timing;
			if overlap == 0.0 && timing.duration > 0.0 {
				timing.duration = timing.duration.max(SHORTEST_CLOSE_SECONDS);
			}
			self.ride(timing, CLOSE_LEAD_MS);
		} else if overlap > travelled
			&& self.ivars().opening.replace(Some(change.timing)).is_none()
		{
			self.after_this_turn(sel!(startKeyboardOpening));
		}
	}

	fn ride(&self, timing: Timing, lead_ms: f64) {
		let from = self.ivars().travelled.get();
		let to = self.keyboard_overlap();
		self.ivars().travelled.set(to);
		if from != to {
			self.push_motion(KeyboardMotion {
				from,
				to,
				duration: timing.duration * 1000.0,
				started_at: epoch_milliseconds() + lead_ms,
				curve: geometry::timing_curve(timing.curve),
			});
		}
		self.setNeedsLayout();
		self.layoutIfNeeded();
	}

	fn catch_up(&self, overlap: f64) {
		let travelled = self.ivars().travelled.get();
		if self.ivars().opening.get().is_some() || overlap == travelled {
			return;
		}
		self.ivars().travelled.set(overlap);
		self.push_motion(KeyboardMotion {
			from: travelled,
			to: overlap,
			duration: 0.0,
			started_at: epoch_milliseconds(),
			curve: geometry::timing_curve(0),
		});
	}

	fn push_motion(&self, motion: KeyboardMotion) {
		if let Some(webview) = self.ivars().webview.load() {
			evaluate(&webview, &geometry::motion_script(&motion));
		}
	}

	fn let_page_follow(&self, page_follows: bool) {
		if self.ivars().page_follows.replace(page_follows) == page_follows {
			return;
		}
		self.ivars().opening.set(None);
		let overlap = self.keyboard_overlap();
		self.ivars().travelled.set(overlap);
		self.setNeedsLayout();
		self.layoutIfNeeded();
		if page_follows && overlap > 0.0 {
			self.push_motion(KeyboardMotion {
				from: overlap,
				to: overlap,
				duration: 0.0,
				started_at: epoch_milliseconds(),
				curve: geometry::timing_curve(0),
			});
		}
		if !page_follows {
			self.aim_drag_dismiss();
		}
	}

	fn let_drag_dismiss(&self, target: Option<CGPoint>) {
		self.ivars().drag_target.set(target);
		let page_follows = self.ivars().page_follows.get();
		if target.is_none() || (page_follows && self.keyboard_overlap() > 0.0) {
			self.aim_drag_dismiss();
		}
	}

	fn aim_drag_dismiss(&self) {
		let Some(webview) = self.ivars().webview.load() else {
			return;
		};
		let scroller = self
			.ivars()
			.drag_target
			.get()
			.filter(|_| self.ivars().page_follows.get())
			.and_then(|target| child_scroller_at(&webview, target));
		let previous = self
			.ivars()
			.drag_scroller
			.replace(scroller.as_deref().map(Weak::new))
			.and_then(|previous| previous.load());
		if let Some(previous) = previous {
			let kept = scroller
				.as_deref()
				.is_some_and(|scroller| std::ptr::eq(scroller, &*previous));
			if !kept {
				previous.setKeyboardDismissMode(
					UIScrollViewKeyboardDismissMode::None,
				);
			}
		}
		if let Some(scroller) = scroller {
			scroller.setKeyboardDismissMode(
				UIScrollViewKeyboardDismissMode::Interactive,
			);
		}
	}

	fn reseed(&self, document_replaced: bool) {
		if document_replaced {
			self.ivars().page_follows.set(false);
			self.ivars().opening.set(None);
			self.ivars().drag_target.set(None);
			self.aim_drag_dismiss();
		}
		self.ivars().sent.set(None);
		self.setNeedsLayout();
	}

	fn after_this_turn(&self, selector: Sel) {
		let nothing: Option<&AnyObject> = None;
		let modes = NSArray::from_retained_slice(&[NSString::from_str(
			"kCFRunLoopCommonModes",
		)]);
		let _: () = unsafe {
			msg_send![
				self,
				performSelector: selector,
				withObject: nothing,
				afterDelay: 0.0f64,
				inModes: &*modes
			]
		};
	}
}

fn epoch_milliseconds() -> f64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0.0, |elapsed| elapsed.as_secs_f64() * 1000.0)
}

fn rect(rect: CGRect) -> Rect {
	Rect {
		x: rect.origin.x,
		y: rect.origin.y,
		width: rect.size.width,
		height: rect.size.height,
	}
}

fn presenting(window: &UIWindow) -> bool {
	window
		.rootViewController()
		.and_then(|root| root.presentedViewController())
		.is_some_and(|presented| !presented.isBeingDismissed())
}

fn child_scroller_at(
	webview: &UIView,
	target: CGPoint,
) -> Option<Retained<UIScrollView>> {
	let page: Option<Retained<UIScrollView>> =
		unsafe { msg_send![webview, scrollView] };
	let mut view = webview.hitTest_withEvent(target, None);
	while let Some(current) = view {
		match current.downcast::<UIScrollView>() {
			Ok(scroller) => {
				let is_page = page
					.as_deref()
					.is_some_and(|page| std::ptr::eq(page, &*scroller));
				return (!is_page).then_some(scroller);
			}
			Err(current) => view = current.superview(),
		}
	}
	None
}

fn evaluate(webview: &UIView, script: &str) {
	let script = NSString::from_str(script);
	let completion: Option<&DynBlock<dyn Fn(*mut AnyObject, *mut NSError)>> =
		None;
	let _: () = unsafe {
		msg_send![
			webview,
			evaluateJavaScript: &*script,
			completionHandler: completion
		]
	};
}

fn keyboard_change(notification: &NSNotification) -> Option<KeyboardChange> {
	let info = notification.userInfo()?;
	let local = info
		.objectForKey(unsafe { UIKeyboardIsLocalUserInfoKey })
		.and_then(|local| local.downcast::<NSNumber>().ok())
		.is_none_or(|local| local.boolValue());
	if !local {
		return None;
	}
	let end = info
		.objectForKey(unsafe { UIKeyboardFrameEndUserInfoKey })?
		.downcast::<NSValue>()
		.ok()?;
	let number = |key: &NSString| {
		info.objectForKey(key)
			.and_then(|number| number.downcast::<NSNumber>().ok())
	};
	Some(KeyboardChange {
		end: unsafe { end.CGRectValue() },
		timing: Timing {
			duration: number(unsafe { UIKeyboardAnimationDurationUserInfoKey })
				.map_or(0.0, |duration| duration.doubleValue()),
			curve: number(unsafe { UIKeyboardAnimationCurveUserInfoKey })
				.map_or(0, |curve| curve.unsignedIntegerValue()),
		},
	})
}

fn observe(
	name: &NSNotificationName,
	handle: impl Fn(&KeyboardFrame, &NSNotification) + 'static,
) -> Observer {
	let block = RcBlock::new(move |notification: NonNull<NSNotification>| {
		let notification = unsafe { notification.as_ref() };
		DRIVER.with_borrow(|driver| {
			if let Some(driver) = driver {
				handle(&driver.frame, notification);
			}
		});
	});
	unsafe {
		NSNotificationCenter::defaultCenter()
			.addObserverForName_object_queue_usingBlock(
				Some(name),
				None,
				Some(&NSOperationQueue::mainQueue()),
				&block,
			)
	}
}

fn drive(mtm: MainThreadMarker, webview: Retained<UIView>) {
	let Some(host) = webview.superview() else {
		tracing::warn!("[keyboard] the webview has no superview");
		return;
	};
	let center = NSNotificationCenter::defaultCenter();
	for name in unsafe {
		[
			UIKeyboardWillShowNotification,
			UIKeyboardWillHideNotification,
			UIKeyboardWillChangeFrameNotification,
			UIKeyboardDidChangeFrameNotification,
		]
	} {
		unsafe {
			center.removeObserver_name_object(&webview, Some(name), None)
		};
	}
	webview.setAutoresizingMask(UIViewAutoresizing::empty());

	let frame = KeyboardFrame::new(mtm, &webview, host.bounds());
	frame.setAutoresizingMask(
		UIViewAutoresizing::FlexibleWidth | UIViewAutoresizing::FlexibleHeight,
	);
	frame.setUserInteractionEnabled(false);
	frame.setBackgroundColor(host.backgroundColor().as_deref());
	host.insertSubview_atIndex(&frame, 0);

	let observers = unsafe {
		vec![
			observe(UIKeyboardWillChangeFrameNotification, |frame, note| {
				if let Some(change) = keyboard_change(note) {
					frame.keyboard_will_change(change);
				}
			}),
			observe(UIKeyboardWillHideNotification, |frame, note| {
				if let Some(change) = keyboard_change(note) {
					frame.keyboard_will_change(KeyboardChange {
						end: CGRect::ZERO,
						..change
					});
				}
			}),
			observe(UIKeyboardDidShowNotification, |frame, _| {
				frame.setNeedsLayout();
			}),
			observe(UIKeyboardDidChangeFrameNotification, |frame, _| {
				frame.setNeedsLayout();
			}),
		]
	};
	frame.setNeedsLayout();
	DRIVER.with_borrow_mut(|driver| {
		*driver = Some(Driver {
			frame,
			_observers: observers,
		});
	});
}

pub fn install(window: &WebviewWindow) {
	let reached = window.with_webview(|webview| {
		let Some(mtm) = MainThreadMarker::new() else {
			tracing::warn!("[keyboard] the webview left the main thread");
			return;
		};
		match unsafe { Retained::retain(webview.inner().cast::<UIView>()) } {
			Some(webview) => drive(mtm, webview),
			None => tracing::warn!("[keyboard] the webview is gone"),
		}
	});
	if let Err(error) = reached {
		tracing::warn!("[keyboard] could not reach the webview: {error}");
	}
}

#[tauri::command]
pub fn set_keyboard_follow(window: WebviewWindow, follow: bool) {
	let dispatched = window.run_on_main_thread(move || {
		DRIVER.with_borrow(|driver| {
			if let Some(driver) = driver {
				driver.frame.let_page_follow(follow);
			}
		});
	});
	if let Err(error) = dispatched {
		tracing::warn!("[keyboard] could not reach the main thread: {error}");
	}
}

#[tauri::command]
pub fn set_keyboard_drag_dismiss(
	window: WebviewWindow,
	target: Option<PagePoint>,
) {
	let target = target.map(|point| CGPoint {
		x: point.x,
		y: point.y,
	});
	let dispatched = window.run_on_main_thread(move || {
		DRIVER.with_borrow(|driver| {
			if let Some(driver) = driver {
				driver.frame.let_drag_dismiss(target);
			}
		});
	});
	if let Err(error) = dispatched {
		tracing::warn!("[keyboard] could not reach the main thread: {error}");
	}
}

pub fn reseed(window: WebviewWindow, payload: PageLoadPayload<'_>) {
	let document_replaced = match payload.event() {
		PageLoadEvent::Started => true,
		PageLoadEvent::Finished => false,
	};
	let dispatched = window.run_on_main_thread(move || {
		DRIVER.with_borrow(|driver| {
			if let Some(driver) = driver {
				driver.frame.reseed(document_replaced);
			}
		});
	});
	if let Err(error) = dispatched {
		tracing::warn!("[keyboard] could not reach the main thread: {error}");
	}
}
