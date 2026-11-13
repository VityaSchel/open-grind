use std::cell::RefCell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::{Retained, Weak};
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
use objc2_foundation::{
	NSNotification, NSNotificationCenter, NSOperationQueue,
};
use objc2_ui_kit::{
	UIAccessibilityIsVoiceOverRunning,
	UIAccessibilityVoiceOverStatusDidChangeNotification, UIView,
};
use tauri::WebviewWindow;

use super::status_script;
use crate::uikit::{evaluate, with_webview};

type Observer = Retained<ProtocolObject<dyn NSObjectProtocol>>;

thread_local! {
	static WATCH: RefCell<Option<Observer>> = const { RefCell::new(None) };
}

fn watch(webview: &UIView) {
	let webview = Weak::new(webview);
	let changed = RcBlock::new(move |_: NonNull<NSNotification>| {
		if let Some(webview) = webview.load() {
			evaluate(
				&webview,
				&status_script(UIAccessibilityIsVoiceOverRunning()),
			);
		}
	});
	let observer = unsafe {
		NSNotificationCenter::defaultCenter()
			.addObserverForName_object_queue_usingBlock(
				Some(UIAccessibilityVoiceOverStatusDidChangeNotification),
				None,
				Some(&NSOperationQueue::mainQueue()),
				&changed,
			)
	};
	WATCH.with_borrow_mut(|slot| *slot = Some(observer));
}

pub fn install(window: &WebviewWindow) {
	with_webview(window, "voice over", |_, webview| watch(&webview));
}

#[tauri::command]
pub fn voice_over_running() -> bool {
	UIAccessibilityIsVoiceOverRunning()
}
