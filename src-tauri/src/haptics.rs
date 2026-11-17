use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HapticKind {
	LongPress,
	Threshold,
	DragStart,
}

#[tauri::command]
pub fn play_haptic(window: tauri::WebviewWindow, kind: HapticKind) {
	#[cfg(target_os = "android")]
	android::play(&window, kind);

	#[cfg(target_os = "ios")]
	ios::play(kind);

	#[cfg(target_os = "macos")]
	macos::play(kind);

	#[cfg(any(target_os = "ios", desktop))]
	let _ = window;

	#[cfg(any(target_os = "linux", target_os = "windows"))]
	let _ = kind;
}

#[cfg(any(target_os = "android", test))]
mod android_feedback {
	use super::HapticKind;

	const LONG_PRESS: i32 = 0;
	const CONTEXT_CLICK: i32 = 6;
	const GESTURE_THRESHOLD_ACTIVATE: i32 = 23;
	const DRAG_START: i32 = 25;
	const ANDROID_14: i32 = 34;

	pub fn android_constant(kind: HapticKind, sdk: i32) -> i32 {
		let has_gesture_constants = sdk >= ANDROID_14;
		match kind {
			HapticKind::LongPress => LONG_PRESS,
			HapticKind::Threshold if has_gesture_constants => {
				GESTURE_THRESHOLD_ACTIVATE
			}
			HapticKind::Threshold => CONTEXT_CLICK,
			HapticKind::DragStart if has_gesture_constants => DRAG_START,
			HapticKind::DragStart => LONG_PRESS,
		}
	}
}

#[cfg(target_os = "android")]
mod android {
	use jni::objects::{JObject, JValue};
	use jni::JNIEnv;

	use super::android_feedback::android_constant;
	use super::HapticKind;

	const FLAG_IGNORE_VIEW_SETTING: i32 = 1;

	fn perform(
		env: &mut JNIEnv<'_>,
		view: &JObject<'_>,
		kind: HapticKind,
	) -> jni::errors::Result<()> {
		let sdk = env
			.get_static_field("android/os/Build$VERSION", "SDK_INT", "I")?
			.i()?;
		env.call_method(
			view,
			"performHapticFeedback",
			"(II)Z",
			&[
				JValue::Int(android_constant(kind, sdk)),
				JValue::Int(FLAG_IGNORE_VIEW_SETTING),
			],
		)?;
		Ok(())
	}

	pub fn play<R: tauri::Runtime>(
		window: &tauri::WebviewWindow<R>,
		kind: HapticKind,
	) {
		let dispatched = window.with_webview(move |webview| {
			webview.jni_handle().exec(move |env, _activity, view| {
				if perform(env, view, kind).is_err() {
					env.exception_clear().ok();
				}
			});
		});
		if let Err(e) = dispatched {
			tracing::warn!("[haptics] could not reach the webview: {e}");
		}
	}
}

#[cfg(any(target_os = "ios", test))]
mod ios_feedback {
	use super::HapticKind;

	#[derive(Debug, Clone, Copy, PartialEq, Eq)]
	pub enum ImpactStyle {
		Light,
		Medium,
	}

	pub fn impact_style(kind: HapticKind) -> ImpactStyle {
		match kind {
			HapticKind::Threshold => ImpactStyle::Light,
			HapticKind::LongPress | HapticKind::DragStart => {
				ImpactStyle::Medium
			}
		}
	}
}

#[cfg(target_os = "ios")]
mod ios {
	use std::cell::OnceCell;
	use std::thread::LocalKey;

	use objc2::rc::Retained;
	use objc2::{MainThreadMarker, MainThreadOnly};
	use objc2_ui_kit::{UIImpactFeedbackGenerator, UIImpactFeedbackStyle};

	use super::ios_feedback::{impact_style, ImpactStyle};
	use super::HapticKind;

	type Generator = OnceCell<Retained<UIImpactFeedbackGenerator>>;

	thread_local! {
		static LIGHT: Generator = const { OnceCell::new() };
		static MEDIUM: Generator = const { OnceCell::new() };
	}

	pub fn play(kind: HapticKind) {
		let Some(mtm) = MainThreadMarker::new() else {
			tracing::warn!("[haptics] play_haptic left the main thread");
			return;
		};
		let (generator, style): (&'static LocalKey<Generator>, _) =
			match impact_style(kind) {
				ImpactStyle::Light => (&LIGHT, UIImpactFeedbackStyle::Light),
				ImpactStyle::Medium => (&MEDIUM, UIImpactFeedbackStyle::Medium),
			};
		generator.with(|generator| {
			let generator = generator.get_or_init(|| create(mtm, style));
			generator.impactOccurred();
			generator.prepare();
		});
	}

	#[allow(deprecated)]
	fn create(
		mtm: MainThreadMarker,
		style: UIImpactFeedbackStyle,
	) -> Retained<UIImpactFeedbackGenerator> {
		UIImpactFeedbackGenerator::initWithStyle(
			UIImpactFeedbackGenerator::alloc(mtm),
			style,
		)
	}
}

#[cfg(target_os = "macos")]
mod macos {
	use objc2_app_kit::{
		NSHapticFeedbackManager, NSHapticFeedbackPattern,
		NSHapticFeedbackPerformanceTime, NSHapticFeedbackPerformer,
	};

	use super::HapticKind;

	pub fn play(kind: HapticKind) {
		let pattern = match kind {
			HapticKind::LongPress => return,
			HapticKind::Threshold => NSHapticFeedbackPattern::Alignment,
			HapticKind::DragStart => NSHapticFeedbackPattern::Generic,
		};
		NSHapticFeedbackManager::defaultPerformer()
			.performFeedbackPattern_performanceTime(
				pattern,
				NSHapticFeedbackPerformanceTime::Now,
			);
	}
}

#[cfg(test)]
mod tests {
	use super::android_feedback::android_constant;
	use super::ios_feedback::{impact_style, ImpactStyle};
	use super::HapticKind;

	#[test]
	fn a_threshold_plays_a_light_impact_on_ios() {
		assert_eq!(impact_style(HapticKind::Threshold), ImpactStyle::Light);
	}

	#[test]
	fn a_long_press_and_a_drag_start_play_a_medium_impact_on_ios() {
		assert_eq!(impact_style(HapticKind::LongPress), ImpactStyle::Medium);
		assert_eq!(impact_style(HapticKind::DragStart), ImpactStyle::Medium);
	}

	#[test]
	fn a_long_press_plays_the_long_press_constant_on_every_version() {
		assert_eq!(android_constant(HapticKind::LongPress, 28), 0);
		assert_eq!(android_constant(HapticKind::LongPress, 36), 0);
	}

	#[test]
	fn a_threshold_uses_the_gesture_constant_from_android_14() {
		assert_eq!(android_constant(HapticKind::Threshold, 34), 23);
		assert_eq!(android_constant(HapticKind::Threshold, 36), 23);
	}

	#[test]
	fn a_threshold_falls_back_to_a_context_click_before_android_14() {
		assert_eq!(android_constant(HapticKind::Threshold, 33), 6);
		assert_eq!(android_constant(HapticKind::Threshold, 28), 6);
	}

	#[test]
	fn a_drag_start_uses_its_own_constant_from_android_14() {
		assert_eq!(android_constant(HapticKind::DragStart, 34), 25);
		assert_eq!(android_constant(HapticKind::DragStart, 36), 25);
	}

	#[test]
	fn a_drag_start_falls_back_to_a_long_press_before_android_14() {
		assert_eq!(android_constant(HapticKind::DragStart, 33), 0);
	}

	#[test]
	fn kinds_arrive_in_camel_case_from_the_frontend() {
		let kinds: Vec<HapticKind> =
			serde_json::from_str(r#"["longPress", "threshold", "dragStart"]"#)
				.unwrap();
		assert_eq!(
			kinds,
			[
				HapticKind::LongPress,
				HapticKind::Threshold,
				HapticKind::DragStart
			]
		);
	}
}
