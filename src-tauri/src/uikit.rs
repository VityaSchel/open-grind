use block2::DynBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{msg_send, MainThreadMarker};
use objc2_foundation::{NSError, NSString};
use objc2_ui_kit::UIView;
use tauri::WebviewWindow;

pub fn evaluate(webview: &UIView, script: &str) {
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

pub fn with_webview(
	window: &WebviewWindow,
	tag: &'static str,
	run: impl FnOnce(MainThreadMarker, Retained<UIView>) + Send + 'static,
) {
	let reached = window.with_webview(move |webview| {
		let Some(mtm) = MainThreadMarker::new() else {
			tracing::warn!("[{tag}] the webview left the main thread");
			return;
		};
		match unsafe { Retained::retain(webview.inner().cast::<UIView>()) } {
			Some(webview) => run(mtm, webview),
			None => tracing::warn!("[{tag}] the webview is gone"),
		}
	});
	if let Err(error) = reached {
		tracing::warn!("[{tag}] could not reach the webview: {error}");
	}
}
