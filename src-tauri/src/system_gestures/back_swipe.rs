use std::cell::{Cell, RefCell};

use block2::{DynBlock, RcBlock};
use objc2::rc::{Retained, Weak};
use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{
	define_class, msg_send, sel, ClassType, DefinedClass, MainThreadMarker,
	MainThreadOnly,
};
use objc2_foundation::{NSError, NSNumber, NSString};
use objc2_ui_kit::{
	UIGestureRecognizer, UIGestureRecognizerDelegate, UIGestureRecognizerState,
	UIRectEdge, UIScreenEdgePanGestureRecognizer, UISwipeGestureRecognizer,
	UITouch, UIView,
};
use tauri::WebviewWindow;

use super::edge_pan::{self, EdgePoint, Release};
use crate::child_scroller::child_scroller_at;
use crate::presenting::presenting;

thread_local! {
	static BACK_SWIPE: RefCell<Option<Retained<BackSwipe>>> =
		const { RefCell::new(None) };
}

struct Swipe {
	webview: Weak<UIView>,
	host: Weak<UIView>,
	recognizer: RefCell<Option<Retained<UIScreenEdgePanGestureRecognizer>>>,
	sent: Cell<Option<f64>>,
	gesture: Cell<u64>,
	arm_order: Cell<u64>,
}

define_class!(
	#[unsafe(super(NSObject))]
	#[thread_kind = MainThreadOnly]
	#[name = "OpenGrindBackSwipe"]
	#[ivars = Swipe]
	struct BackSwipe;

	unsafe impl NSObjectProtocol for BackSwipe {}

	unsafe impl UIGestureRecognizerDelegate for BackSwipe {
		#[unsafe(method(gestureRecognizerShouldBegin:))]
		fn gesture_recognizer_should_begin(
			&self,
			recognizer: &UIGestureRecognizer,
		) -> bool {
			self.may_begin(recognizer)
		}

		#[unsafe(method(gestureRecognizer:shouldReceiveTouch:))]
		fn gesture_recognizer_should_receive_touch(
			&self,
			_recognizer: &UIGestureRecognizer,
			touch: &UITouch,
		) -> bool {
			self.touch_landed(touch);
			true
		}

		#[unsafe(method(gestureRecognizer:shouldBeRequiredToFailByGestureRecognizer:))]
		fn gesture_recognizer_should_be_required_to_fail_by(
			&self,
			_recognizer: &UIGestureRecognizer,
			other: &UIGestureRecognizer,
		) -> bool {
			self.waits_for_back_swipe(other)
		}
	}

	impl BackSwipe {
		#[unsafe(method(swiped:))]
		fn swiped(&self, recognizer: &UIScreenEdgePanGestureRecognizer) {
			self.follow(recognizer);
		}
	}
);

impl BackSwipe {
	fn new(
		mtm: MainThreadMarker,
		webview: &UIView,
		host: &UIView,
	) -> Retained<Self> {
		let this = Self::alloc(mtm).set_ivars(Swipe {
			webview: Weak::new(webview),
			host: Weak::new(host),
			recognizer: RefCell::new(None),
			sent: Cell::new(None),
			gesture: Cell::new(0),
			arm_order: Cell::new(0),
		});
		unsafe { msg_send![super(this), init] }
	}

	fn may_begin(&self, recognizer: &UIGestureRecognizer) -> bool {
		let Some(webview) = self.ivars().webview.load() else {
			return false;
		};
		if webview.window().is_none_or(|window| presenting(&window)) {
			return false;
		}
		let point = recognizer.locationInView(Some(&webview));
		!child_scroller_at(&webview, point).is_some_and(|scroller| {
			matches!(
				scroller.panGestureRecognizer().state(),
				UIGestureRecognizerState::Began
					| UIGestureRecognizerState::Changed
			)
		})
	}

	fn touch_landed(&self, touch: &UITouch) {
		let (Some(webview), Some(host)) =
			(self.ivars().webview.load(), self.ivars().host.load())
		else {
			return;
		};
		if edge_pan::prepares_for(touch.locationInView(Some(&host)).x) {
			evaluate(&webview, edge_pan::PREPARE_SCRIPT);
		}
	}

	fn waits_for_back_swipe(&self, other: &UIGestureRecognizer) -> bool {
		let name = other.class().name().to_string_lossy();
		if edge_pan::yields_to_back_swipe(&name) {
			return true;
		}
		let Some(webview) = self.ivars().webview.load() else {
			return false;
		};
		other.isKindOfClass(UISwipeGestureRecognizer::class())
			&& other
				.view()
				.is_some_and(|view| view.isDescendantOfView(&webview))
	}

	fn follow(&self, recognizer: &UIScreenEdgePanGestureRecognizer) {
		let (Some(webview), Some(host)) =
			(self.ivars().webview.load(), self.ivars().host.load())
		else {
			return;
		};
		let width = host.bounds().size.width;
		let progress = edge_pan::progress(
			recognizer.translationInView(Some(&host)).x,
			width,
		);
		match recognizer.state() {
			UIGestureRecognizerState::Began => {
				let gesture = self.ivars().gesture.get() + 1;
				self.ivars().gesture.set(gesture);
				self.ivars().sent.set(Some(progress));
				let at = recognizer.locationInView(Some(&host));
				self.start(&webview, EdgePoint { x: at.x, y: at.y }, gesture);
			}
			UIGestureRecognizerState::Changed => {
				self.send_progress(&webview, progress);
			}
			UIGestureRecognizerState::Ended => {
				self.ivars().sent.set(None);
				let velocity = recognizer.velocityInView(Some(&host)).x / width;
				evaluate(
					&webview,
					&edge_pan::finish_script(Release::at(progress, velocity)),
				);
			}
			UIGestureRecognizerState::Cancelled
			| UIGestureRecognizerState::Failed => {
				self.ivars().sent.set(None);
				evaluate(
					&webview,
					&edge_pan::finish_script(Release::CANCELLED),
				);
			}
			_ => {}
		}
	}

	fn send_progress(&self, webview: &UIView, progress: f64) {
		if self.ivars().sent.replace(Some(progress)) != Some(progress) {
			evaluate(webview, &edge_pan::progress_script(progress));
		}
	}

	fn start(&self, webview: &UIView, point: EdgePoint, gesture: u64) {
		let swipe = Weak::new(self);
		let answered =
			RcBlock::new(move |result: *mut AnyObject, _: *mut NSError| {
				let accepted = unsafe { result.as_ref() }
					.and_then(|result| result.downcast_ref::<NSNumber>())
					.is_some_and(NSNumber::boolValue);
				if let (false, Some(swipe)) = (accepted, swipe.load()) {
					swipe.refuse(gesture);
				}
			});
		let script = NSString::from_str(&edge_pan::start_script(point));
		let _: () = unsafe {
			msg_send![
				webview,
				evaluateJavaScript: &*script,
				completionHandler: &*answered
			]
		};
	}

	fn refuse(&self, gesture: u64) {
		if self.ivars().gesture.get() != gesture {
			return;
		}
		let recognizer = self.ivars().recognizer.borrow();
		let Some(recognizer) = recognizer.as_deref() else {
			return;
		};
		let active = matches!(
			recognizer.state(),
			UIGestureRecognizerState::Began | UIGestureRecognizerState::Changed
		);
		if active && recognizer.isEnabled() {
			recognizer.setEnabled(false);
			recognizer.setEnabled(true);
		}
	}

	fn arm(&self, armed: bool, order: u64) {
		if order <= self.ivars().arm_order.get() {
			return;
		}
		self.ivars().arm_order.set(order);
		if let Some(recognizer) = self.ivars().recognizer.borrow().as_deref() {
			recognizer.setEnabled(armed);
		}
	}

	fn disarm(&self) {
		self.ivars().arm_order.set(0);
		if let Some(recognizer) = self.ivars().recognizer.borrow().as_deref() {
			recognizer.setEnabled(false);
		}
	}
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

fn attach(mtm: MainThreadMarker, webview: Retained<UIView>) {
	let Some(host) = webview.superview() else {
		tracing::warn!("[back swipe] the webview has no superview");
		return;
	};
	let swipe = BackSwipe::new(mtm, &webview, &host);
	let target: &AnyObject = &swipe;
	let recognizer = unsafe {
		UIScreenEdgePanGestureRecognizer::initWithTarget_action(
			UIScreenEdgePanGestureRecognizer::alloc(mtm),
			Some(target),
			Some(sel!(swiped:)),
		)
	};
	recognizer.setEdges(UIRectEdge::Left);
	recognizer.setDelegate(Some(ProtocolObject::from_ref(&*swipe)));
	recognizer.setEnabled(false);
	host.addGestureRecognizer(&recognizer);
	*swipe.ivars().recognizer.borrow_mut() = Some(recognizer);
	BACK_SWIPE.with_borrow_mut(|slot| *slot = Some(swipe));
}

pub fn install(window: &WebviewWindow) {
	let reached = window.with_webview(|webview| {
		let Some(mtm) = MainThreadMarker::new() else {
			tracing::warn!("[back swipe] the webview left the main thread");
			return;
		};
		match unsafe { Retained::retain(webview.inner().cast::<UIView>()) } {
			Some(webview) => attach(mtm, webview),
			None => tracing::warn!("[back swipe] the webview is gone"),
		}
	});
	if let Err(error) = reached {
		tracing::warn!("[back swipe] could not reach the webview: {error}");
	}
}

#[tauri::command]
pub fn set_back_swipe_armed(window: WebviewWindow, armed: bool, order: u64) {
	let dispatched = window.run_on_main_thread(move || {
		BACK_SWIPE.with_borrow(|swipe| {
			if let Some(swipe) = swipe {
				swipe.arm(armed, order);
			}
		});
	});
	if let Err(error) = dispatched {
		tracing::warn!("[back swipe] could not reach the main thread: {error}");
	}
}

pub fn disarm(window: &WebviewWindow) {
	let dispatched = window.run_on_main_thread(|| {
		BACK_SWIPE.with_borrow(|swipe| {
			if let Some(swipe) = swipe {
				swipe.disarm();
			}
		});
	});
	if let Err(error) = dispatched {
		tracing::warn!("[back swipe] could not reach the main thread: {error}");
	}
}
