#[cfg(target_os = "android")]
mod android;
#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple;
#[cfg(all(desktop, not(any(target_os = "macos", target_os = "windows"))))]
mod linux;
#[cfg(any(desktop, target_os = "ios"))]
mod os_settings;
#[cfg(any(desktop, target_os = "ios"))]
mod pattern;
#[cfg(target_os = "windows")]
mod windows;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::AppHandle;
#[cfg(any(desktop, target_os = "ios"))]
use tauri::Manager;
use tauri::Wry;

#[cfg(desktop)]
pub use os_settings::refresh_on_focus;
#[cfg(any(desktop, target_os = "ios"))]
use os_settings::{LastRead, RegionalSettings};
#[cfg(all(
	desktop,
	any(not(any(target_os = "macos", target_os = "windows")), test)
))]
pub use pattern::posix_locale;

const CHANGED_EVENT: &str = "regional-settings-changed";

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("regional-settings")
		.setup(|_app, _api| {
			#[cfg(any(desktop, target_os = "ios"))]
			_app.manage(LastRead::default());
			#[cfg(any(target_os = "macos", target_os = "ios"))]
			apple::observe(_app.clone());
			#[cfg(target_os = "android")]
			android::register(_app, &_api)?;
			Ok(())
		})
		.build()
}

#[cfg(any(desktop, target_os = "ios"))]
#[tauri::command]
pub async fn regional_settings(app: AppHandle) -> RegionalSettings {
	os_settings::current(&app).await
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn regional_settings(app: AppHandle) -> serde_json::Value {
	android::current(&app).await
}

#[cfg(test)]
mod pins {
	use crate::pin_support::{manifest_element, xml_attribute};

	#[test]
	fn a_system_language_change_reaches_the_running_activities() {
		for activity in [".AppActivity", ".FacebookOauthActivity"] {
			let handled: Vec<&str> = xml_attribute(
				manifest_element("activity", activity),
				"android:configChanges",
			)
			.unwrap_or_default()
			.split('|')
			.collect();
			for change in ["locale", "layoutDirection"] {
				assert!(
					handled.contains(&change),
					"{activity} no longer handles {change} changes, so a system language change relaunches it and reloads its WebView instead of reaching onConfigurationChanged"
				);
			}
		}
	}
}
