use std::cell::RefCell;

use objc2::rc::Weak;
use objc2_ui_kit::{
	UIAccessibilityIsVoiceOverRunning,
	UIAccessibilityVoiceOverStatusDidChangeNotification, UIView,
};
use tauri::WebviewWindow;

use super::status_script;
use crate::uikit::{evaluate, observe, with_webview, Observer};

thread_local! {
	static WATCH: RefCell<Option<Observer>> = const { RefCell::new(None) };
}

fn watch(webview: &UIView) {
	let webview = Weak::new(webview);
	let observer = observe(
		unsafe { UIAccessibilityVoiceOverStatusDidChangeNotification },
		move |_, _| {
			if let Some(webview) = webview.load() {
				evaluate(
					&webview,
					&status_script(UIAccessibilityIsVoiceOverRunning()),
				);
			}
		},
	);
	WATCH.with_borrow_mut(|slot| *slot = Some(observer));
}

pub fn install(window: &WebviewWindow) {
	with_webview(window, "voice over", |_, webview| watch(&webview));
}

#[tauri::command]
pub fn voice_over_running() -> bool {
	UIAccessibilityIsVoiceOverRunning()
}
