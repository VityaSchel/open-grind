use std::cell::{Cell, RefCell};

use block2::RcBlock;
use objc2::rc::{Retained, Weak};
use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{
	define_class, msg_send, sel, ClassType, DefinedClass, MainThreadMarker,
	MainThreadOnly,
};
use objc2_foundation::{NSError, NSNumber, NSString};
use objc2_ui_kit::{
	UIGestureRecognizer, UIGestureRecognizerDelegate, UIGestureRecognizerState,
	UIRectEdge, UIScreenEdgePanGestureRecognizer, UIScrollView,
	UISwipeGestureRecognizer, UITouch, UIView,
};
use tauri::{Manager, WebviewWindow};

use super::edge_pan::{
	self, ArmState, Arming, EdgeZone, Release, ScrollerExtent, ScrollerTouch,
};
use crate::child_scroller::child_scroller_at;
use crate::page_point::PagePoint;
use crate::presenting::presenting;
use crate::uikit::{evaluate, on_main_thread, with_webview};

thread_local! {
	static BACK_SWIPE: RefCell<Option<Retained<BackSwipe>>> =
		const { RefCell::new(None) };
}

struct Swipe {
	webview: Weak<UIView>,
	recognizer: Retained<UIScreenEdgePanGestureRecognizer>,
	sent: Cell<Option<f64>>,
	gesture: Cell<u64>,
	arm_state: RefCell<ArmState>,
	landed_in_edge_zone: Cell<bool>,
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
		recognizer: Retained<UIScreenEdgePanGestureRecognizer>,
	) -> Retained<Self> {
		let this = Self::alloc(mtm).set_ivars(Swipe {
			webview: Weak::new(webview),
			recognizer,
			sent: Cell::new(None),
			gesture: Cell::new(0),
			arm_state: RefCell::default(),
			landed_in_edge_zone: Cell::new(false),
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
		let Some(host) = self.ivars().recognizer.view() else {
			return;
		};
		let landed =
			edge_pan::lands_in_edge_zone(touch.locationInView(Some(&host)).x);
		self.ivars().landed_in_edge_zone.set(landed);
		if let (true, Some(webview)) = (landed, self.ivars().webview.load()) {
			evaluate(&webview, edge_pan::PREPARE_SCRIPT);
		}
	}

	fn waits_for_back_swipe(&self, other: &UIGestureRecognizer) -> bool {
		let name = other.class().name().to_string_lossy();
		if edge_pan::yields_to_back_swipe(&name) {
			return true;
		}
		let (Some(webview), Some(view)) =
			(self.ivars().webview.load(), other.view())
		else {
			return false;
		};
		if !view.isDescendantOfView(&webview) {
			return false;
		}
		if other.isKindOfClass(UISwipeGestureRecognizer::class()) {
			return true;
		}
		view.downcast::<UIScrollView>()
			.is_ok_and(|scroller| self.scroller_waits(&scroller, other))
	}

	fn scroller_waits(
		&self,
		scroller: &UIScrollView,
		other: &UIGestureRecognizer,
	) -> bool {
		let pan = scroller.panGestureRecognizer();
		let pan: &UIGestureRecognizer = &pan;
		if !std::ptr::eq(pan, other) || !scroller.isScrollEnabled() {
			return false;
		}
		let inset = scroller.adjustedContentInset();
		edge_pan::scroller_waits_for_back_swipe(ScrollerTouch {
			zone: self.ivars().arm_state.borrow().edge_zone(),
			landed_in_edge_zone: self.ivars().landed_in_edge_zone.get(),
			scrolls_sideways: ScrollerExtent {
				content_width: scroller.contentSize().width,
				inset_left: inset.left,
				inset_right: inset.right,
				visible_width: scroller.bounds().size.width,
			}
			.scrolls_sideways(),
		})
	}

	fn follow(&self, recognizer: &UIScreenEdgePanGestureRecognizer) {
		let (Some(webview), Some(host)) =
			(self.ivars().webview.load(), recognizer.view())
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
				self.start(&webview, PagePoint { x: at.x, y: at.y }, gesture);
			}
			UIGestureRecognizerState::Changed => {
				self.send_progress(&webview, progress);
			}
			UIGestureRecognizerState::Ended => {
				let velocity = recognizer.velocityInView(Some(&host)).x / width;
				evaluate(
					&webview,
					&edge_pan::finish_script(Release::at(progress, velocity)),
				);
			}
			UIGestureRecognizerState::Cancelled
			| UIGestureRecognizerState::Failed => {
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

	fn start(&self, webview: &UIView, point: PagePoint, gesture: u64) {
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
		let recognizer = &self.ivars().recognizer;
		let active = matches!(
			recognizer.state(),
			UIGestureRecognizerState::Began | UIGestureRecognizerState::Changed
		);
		if active && recognizer.isEnabled() {
			recognizer.setEnabled(false);
			recognizer.setEnabled(true);
		}
	}

	fn arm(&self, arming: Arming) {
		let armed = self.ivars().arm_state.borrow_mut().apply(arming);
		if let Some(armed) = armed {
			self.ivars().recognizer.setEnabled(armed);
		}
	}

	fn disarm(&self) {
		self.ivars().arm_state.borrow_mut().reset();
		self.ivars().recognizer.setEnabled(false);
	}
}

fn attach(mtm: MainThreadMarker, webview: Retained<UIView>) {
	let Some(host) = webview.superview() else {
		tracing::warn!("[back swipe] the webview has no superview");
		return;
	};
	let recognizer = UIScreenEdgePanGestureRecognizer::new(mtm);
	recognizer.setEdges(UIRectEdge::Left);
	recognizer.setEnabled(false);
	let swipe = BackSwipe::new(mtm, &webview, recognizer);
	let recognizer = &swipe.ivars().recognizer;
	unsafe { recognizer.addTarget_action(&swipe, sel!(swiped:)) };
	recognizer.setDelegate(Some(ProtocolObject::from_ref(&*swipe)));
	host.addGestureRecognizer(recognizer);
	BACK_SWIPE.with_borrow_mut(|slot| *slot = Some(swipe));
}

pub fn install(window: &WebviewWindow) {
	with_webview(window, "back swipe", attach);
}

fn with_swipe(
	window: &WebviewWindow,
	work: impl FnOnce(&BackSwipe) + Send + 'static,
) {
	on_main_thread(window.app_handle(), "back swipe", move |_| {
		BACK_SWIPE.with_borrow(|swipe| {
			if let Some(swipe) = swipe {
				work(swipe);
			}
		});
	});
}

#[tauri::command]
pub fn set_back_swipe_armed(
	window: WebviewWindow,
	armed: bool,
	edge_zone: EdgeZone,
	order: u64,
) {
	with_swipe(&window, move |swipe| {
		swipe.arm(Arming {
			armed,
			edge_zone,
			order,
		});
	});
}

pub fn disarm(window: &WebviewWindow) {
	with_swipe(window, BackSwipe::disarm);
}
