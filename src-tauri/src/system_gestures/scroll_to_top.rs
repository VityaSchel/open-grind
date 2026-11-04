use objc2::rc::Retained;
use objc2_core_foundation::CGPoint;
use objc2_foundation::{NSOperatingSystemVersion, NSProcessInfo};
use objc2_ui_kit::UIView;
use tauri::WebviewWindow;

use super::scroll_target::ScrollerPoint;
use crate::child_scroller::child_scroller_at;

const MOMENTUM_STOP_SINCE: NSOperatingSystemVersion =
	NSOperatingSystemVersion {
		majorVersion: 17,
		minorVersion: 4,
		patchVersion: 0,
	};

fn stop_momentum(webview: &UIView, at: ScrollerPoint) {
	let coasting = child_scroller_at(webview, CGPoint { x: at.x, y: at.y })
		.filter(|scroller| scroller.isDecelerating());
	if let Some(scroller) = coasting {
		scroller.stopScrollingAndZooming();
	}
}

#[tauri::command]
pub fn stop_scroll_momentum(window: WebviewWindow, at: ScrollerPoint) {
	if !NSProcessInfo::processInfo()
		.isOperatingSystemAtLeastVersion(MOMENTUM_STOP_SINCE)
	{
		return;
	}
	let reached = window.with_webview(move |webview| {
		match unsafe { Retained::retain(webview.inner().cast::<UIView>()) } {
			Some(webview) => stop_momentum(&webview, at),
			None => tracing::warn!("[scroll to top] the webview is gone"),
		}
	});
	if let Err(error) = reached {
		tracing::warn!("[scroll to top] could not reach the webview: {error}");
	}
}
