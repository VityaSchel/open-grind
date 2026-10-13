#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "macos")]
mod apple;
#[cfg(desktop)]
mod desktop;
#[cfg(all(desktop, not(any(target_os = "macos", target_os = "windows"))))]
mod linux;
#[cfg(desktop)]
mod tags;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(mobile)]
use serde_json::Value;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(any(desktop, target_os = "android"))]
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;
use tauri::Wry;

#[cfg(desktop)]
pub use desktop::refresh_on_focus;
#[cfg(desktop)]
use desktop::{AppLanguages, LastRead};

#[cfg(any(desktop, target_os = "android"))]
const CHANGED_EVENT: &str = "app-language-changed";

#[cfg(any(desktop, target_os = "ios"))]
const NO_PER_APP_SETTING: &str =
	"this platform has no per-app language setting";

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("app-language")
		.setup(|_app, _api| {
			#[cfg(desktop)]
			_app.manage(LastRead::default());
			#[cfg(target_os = "android")]
			android::register(_app, &_api)?;
			Ok(())
		})
		.build()
}

#[cfg(desktop)]
#[tauri::command]
pub async fn app_languages(app: AppHandle) -> AppLanguages {
	desktop::current(&app)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn app_languages(app: AppHandle) -> Value {
	android::current(&app).await
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn app_languages() -> Value {
	Value::Null
}

#[cfg(desktop)]
#[tauri::command]
pub async fn set_app_language(
	app: AppHandle,
	tag: Option<String>,
) -> Result<(), String> {
	desktop::set(&app, tag.as_deref())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn set_app_language(
	app: AppHandle,
	tag: Option<String>,
) -> Result<(), String> {
	android::set(&app, tag).await
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn set_app_language() -> Result<(), String> {
	Err(NO_PER_APP_SETTING.into())
}

#[cfg(test)]
mod pins {
	use std::collections::BTreeSet;

	use super::CHANGED_EVENT;
	use crate::pin_support::{
		kotlin_package, squashed, xml_attribute, MANIFEST,
	};

	const BRIDGE: &str = include_str!("android.rs");
	const PLUGIN: &str = include_str!(
		"../../gen/android/app/src/main/java/org/opengrind/language/AppLanguagePlugin.kt"
	);
	const LOCALE_CONFIG: &str = include_str!(
		"../../gen/android/app/src/main/res/xml/locales_config.xml"
	);
	const LIB: &str = include_str!("../lib.rs");
	const FRONTEND: &str =
		include_str!("../../../src/lib/platform/app-language.ts");

	fn bridge_commands() -> BTreeSet<&'static str> {
		BRIDGE
			.split(">(")
			.skip(1)
			.filter_map(|call| call.trim_start().strip_prefix('"'))
			.filter_map(|call| call.split('"').next())
			.collect()
	}

	fn plugin_commands() -> BTreeSet<&'static str> {
		PLUGIN
			.split("@Command")
			.skip(1)
			.filter_map(|declaration| {
				declaration.split_once("fun ")?.1.split('(').next()
			})
			.map(str::trim)
			.collect()
	}

	#[test]
	fn the_bridge_and_the_android_plugin_agree_on_every_command() {
		let bridge = bridge_commands();
		assert!(
			bridge.contains("setAppLanguage") && bridge.len() == 3,
			"the bridge commands were not parsed: {bridge:?}"
		);
		assert_eq!(
			bridge,
			plugin_commands(),
			"app_language/android.rs and AppLanguagePlugin.kt no longer name the same commands, so a call rejects at runtime or a command is dead"
		);
		let registration = squashed(BRIDGE);
		let package = kotlin_package(PLUGIN, "AppLanguagePlugin.kt");
		assert!(
			registration.contains(&format!(
				"register_android_plugin(\"{package}\",\"AppLanguagePlugin\""
			)) && squashed(PLUGIN).contains("classAppLanguagePlugin("),
			"the bridge registers a plugin class that AppLanguagePlugin.kt does not declare"
		);
	}

	#[test]
	fn android_lists_the_app_under_the_generated_languages() {
		let start = MANIFEST.find("<application").expect("<application");
		let end = start + MANIFEST[start..].find('>').expect("<application>");
		assert_eq!(
			xml_attribute(&MANIFEST[start..end], "android:localeConfig"),
			Some("@xml/locales_config"),
			"without android:localeConfig, Settings > App languages does not offer Open Grind"
		);
		assert!(LOCALE_CONFIG.contains("<locale-config"));
	}

	#[test]
	fn the_frontend_uses_the_commands_and_event_registered_here() {
		for command in ["app_languages", "set_app_language"] {
			assert!(
				LIB.contains(&format!("app_language::{command},")),
				"lib.rs does not register {command}"
			);
			assert!(
				FRONTEND.contains(&format!("\"{command}\"")),
				"app-language.ts no longer invokes {command}"
			);
		}
		assert!(
			FRONTEND.contains(&format!("\"{CHANGED_EVENT}\"")),
			"app-language.ts no longer listens for {CHANGED_EVENT}"
		);
	}
}
