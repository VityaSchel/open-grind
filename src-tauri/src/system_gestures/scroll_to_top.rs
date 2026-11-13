use objc2::rc::{Retained, Weak};
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{
	define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_foundation::{NSOperatingSystemVersion, NSProcessInfo};
use objc2_ui_kit::{
	UIResponder, UIScrollView, UIScrollViewContentInsetAdjustmentBehavior,
	UIScrollViewDelegate, UIView, UIViewAutoresizing,
};
use tauri::WebviewWindow;

use super::scroll_target::STATUS_BAR_TAP_SCRIPT;
use crate::child_scroller::child_scroller_at;
use crate::page_point::PagePoint;
use crate::presenting::presenting;
use crate::uikit::{evaluate, with_webview};

const MOMENTUM_STOP_SINCE: NSOperatingSystemVersion =
	NSOperatingSystemVersion {
		majorVersion: 17,
		minorVersion: 4,
		patchVersion: 0,
	};
const SENTINEL_TRAVEL: f64 = 1000.0;

struct Sentinel {
	webview: Weak<UIView>,
}

define_class!(
	#[unsafe(super(UIScrollView, UIView, UIResponder, NSObject))]
	#[thread_kind = MainThreadOnly]
	#[name = "OpenGrindStatusBarTap"]
	#[ivars = Sentinel]
	struct StatusBarTap;

	unsafe impl NSObjectProtocol for StatusBarTap {}

	unsafe impl UIScrollViewDelegate for StatusBarTap {
		#[unsafe(method(scrollViewShouldScrollToTop:))]
		fn scroll_view_should_scroll_to_top(
			&self,
			_scroll_view: &UIScrollView,
		) -> bool {
			self.tapped();
			false
		}
	}
);

impl StatusBarTap {
	fn new(
		mtm: MainThreadMarker,
		webview: &UIView,
		width: f64,
	) -> Retained<Self> {
		let this = Self::alloc(mtm).set_ivars(Sentinel {
			webview: Weak::new(webview),
		});
		let frame = CGRect {
			origin: CGPoint { x: 0.0, y: -1.0 },
			size: CGSize { width, height: 1.0 },
		};
		let this: Retained<Self> =
			unsafe { msg_send![super(this), initWithFrame: frame] };
		this.setAutoresizingMask(UIViewAutoresizing::FlexibleWidth);
		this.setContentInsetAdjustmentBehavior(
			UIScrollViewContentInsetAdjustmentBehavior::Never,
		);
		this.setContentSize(CGSize {
			width,
			height: 1.0 + SENTINEL_TRAVEL,
		});
		this.setContentOffset(CGPoint {
			x: 0.0,
			y: SENTINEL_TRAVEL,
		});
		this.setShowsVerticalScrollIndicator(false);
		this.setShowsHorizontalScrollIndicator(false);
		this.setScrollsToTop(true);
		let _: () =
			unsafe { msg_send![&*this, setIsAccessibilityElement: false] };
		let _: () =
			unsafe { msg_send![&*this, setAccessibilityElementsHidden: true] };
		unsafe { this.setDelegate(Some(ProtocolObject::from_ref(&*this))) };
		this.hide_edge_effects();
		this
	}

	fn hide_edge_effects(&self) {
		if !self.respondsToSelector(sel!(topEdgeEffect)) {
			return;
		}
		for effect in [
			self.topEdgeEffect(),
			self.leftEdgeEffect(),
			self.bottomEdgeEffect(),
			self.rightEdgeEffect(),
		] {
			effect.setHidden(true);
		}
	}

	fn tapped(&self) {
		let Some(webview) = self.ivars().webview.load() else {
			return;
		};
		if webview.window().is_none_or(|window| presenting(&window)) {
			return;
		}
		evaluate(&webview, STATUS_BAR_TAP_SCRIPT);
	}
}

fn attach(mtm: MainThreadMarker, webview: Retained<UIView>) {
	let Some(host) = webview.superview() else {
		tracing::warn!("[scroll to top] the webview has no superview");
		return;
	};
	let page: Option<Retained<UIScrollView>> =
		unsafe { msg_send![&webview, scrollView] };
	if let Some(page) = page {
		page.setScrollsToTop(false);
	}
	let sentinel = StatusBarTap::new(mtm, &webview, host.bounds().size.width);
	host.addSubview(&sentinel);
}

pub fn install(window: &WebviewWindow) {
	with_webview(window, "scroll to top", attach);
}

fn stop_momentum(webview: &UIView, at: PagePoint) {
	let coasting = child_scroller_at(webview, CGPoint { x: at.x, y: at.y })
		.filter(|scroller| scroller.isDecelerating());
	if let Some(scroller) = coasting {
		scroller.stopScrollingAndZooming();
	}
}

#[tauri::command]
pub fn stop_scroll_momentum(window: WebviewWindow, at: PagePoint) {
	if !NSProcessInfo::processInfo()
		.isOperatingSystemAtLeastVersion(MOMENTUM_STOP_SINCE)
	{
		return;
	}
	with_webview(&window, "scroll to top", move |_, webview| {
		stop_momentum(&webview, at);
	});
}
