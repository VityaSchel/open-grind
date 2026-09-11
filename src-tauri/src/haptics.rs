#[tauri::command]
pub fn haptic_threshold_reached(window: tauri::WebviewWindow) {
	#[cfg(target_os = "android")]
	android::threshold_reached(&window);

	#[cfg(target_os = "macos")]
	macos::threshold_reached();

	#[cfg(not(target_os = "android"))]
	let _ = window;
}

#[cfg(target_os = "android")]
mod android {
	use jni::objects::{JObject, JValue};
	use jni::JNIEnv;

	const CONTEXT_CLICK: i32 = 6;
	const GESTURE_THRESHOLD_ACTIVATE: i32 = 23;
	const ANDROID_14: i32 = 34;

	fn perform(
		env: &mut JNIEnv<'_>,
		view: &JObject<'_>,
	) -> jni::errors::Result<()> {
		let sdk = env
			.get_static_field("android/os/Build$VERSION", "SDK_INT", "I")?
			.i()?;
		let constant = if sdk >= ANDROID_14 {
			GESTURE_THRESHOLD_ACTIVATE
		} else {
			CONTEXT_CLICK
		};
		env.call_method(
			view,
			"performHapticFeedback",
			"(I)Z",
			&[JValue::Int(constant)],
		)?;
		Ok(())
	}

	pub fn threshold_reached<R: tauri::Runtime>(
		window: &tauri::WebviewWindow<R>,
	) {
		let dispatched = window.with_webview(|webview| {
			webview.jni_handle().exec(|env, _activity, view| {
				if perform(env, view).is_err() {
					env.exception_clear().ok();
				}
			});
		});
		if let Err(e) = dispatched {
			tracing::warn!("[haptics] could not reach the webview: {e}");
		}
	}
}

#[cfg(target_os = "macos")]
mod macos {
	use objc2_app_kit::{
		NSHapticFeedbackManager, NSHapticFeedbackPattern,
		NSHapticFeedbackPerformanceTime, NSHapticFeedbackPerformer,
	};

	pub fn threshold_reached() {
		NSHapticFeedbackManager::defaultPerformer()
			.performFeedbackPattern_performanceTime(
				NSHapticFeedbackPattern::Alignment,
				NSHapticFeedbackPerformanceTime::Now,
			);
	}
}
