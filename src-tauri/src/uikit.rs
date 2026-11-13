use block2::DynBlock;
use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_foundation::{NSError, NSString};
use objc2_ui_kit::UIView;

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
