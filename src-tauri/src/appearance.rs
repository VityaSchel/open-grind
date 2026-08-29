//! Unlocks WebKit's `-apple-visual-effect` in the app's webviews. No-op off macOS.

pub fn unlock_visual_effects<R: tauri::Runtime>(
	window: &tauri::WebviewWindow<R>,
) {
	#[cfg(all(target_os = "macos", feature = "private-api"))]
	{
		use tauri::Manager;

		if !window.config().app.macos_private_api {
			return;
		}

		let dispatched = window.with_webview(|webview| {
			if !macos::enable_system_appearance(webview.inner()) {
				tracing::warn!(
					"[appearance] useSystemAppearance is unavailable; \
					 -apple-visual-effect will not parse"
				);
			}
		});
		if let Err(e) = dispatched {
			tracing::warn!("[appearance] could not reach the webview: {e}");
		}
	}

	#[cfg(not(all(target_os = "macos", feature = "private-api")))]
	let _ = window;
}

#[cfg(all(target_os = "macos", feature = "private-api"))]
mod macos {
	use std::ffi::c_void;

	use objc2::runtime::AnyObject;
	use objc2::{msg_send, sel};

	pub fn enable_system_appearance(webview: *mut c_void) -> bool {
		if webview.is_null() {
			return false;
		}

		let webview: &AnyObject = unsafe { &*webview.cast::<AnyObject>() };
		let setter = sel!(_setUseSystemAppearance:);

		unsafe {
			// wry enables objc2's `disable-encoding-assertions`, so a renamed
			// selector would raise through Rust frames rather than panic.
			if !msg_send![webview, respondsToSelector: setter] {
				return false;
			}
			let _: () = msg_send![webview, _setUseSystemAppearance: true];
			msg_send![webview, _useSystemAppearance]
		}
	}

	#[cfg(test)]
	mod tests {
		use objc2::runtime::AnyClass;
		use objc2::sel;

		#[test]
		fn refuses_a_null_webview() {
			assert!(!super::enable_system_appearance(std::ptr::null_mut()));
		}

		#[test]
		fn webkit_still_answers_the_private_setter() {
			let class =
				AnyClass::get(c"WKWebView").expect("WebKit is linked in");
			assert!(
				class
					.instance_method(sel!(_setUseSystemAppearance:))
					.is_some(),
				"WebKit renamed _setUseSystemAppearance:, so -apple-visual-effect \
				 has silently stopped parsing"
			);
		}
	}
}
