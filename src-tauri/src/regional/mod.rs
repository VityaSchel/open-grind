#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "macos")]
mod apple;
#[cfg(desktop)]
mod desktop;
#[cfg(all(desktop, not(any(target_os = "macos", target_os = "windows"))))]
mod linux;
#[cfg(desktop)]
mod pattern;
#[cfg(target_os = "windows")]
mod windows;

use tauri::plugin::{Builder, TauriPlugin};
#[cfg(any(desktop, target_os = "android"))]
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;
use tauri::Wry;

#[cfg(desktop)]
pub use desktop::refresh_on_focus;
#[cfg(desktop)]
use desktop::{LastRead, RegionalSettings};

#[cfg(any(desktop, target_os = "android"))]
const CHANGED_EVENT: &str = "regional-settings-changed";

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("regional-settings")
		.setup(|_app, _api| {
			#[cfg(desktop)]
			_app.manage(LastRead::default());
			#[cfg(target_os = "macos")]
			apple::observe(_app.clone());
			#[cfg(target_os = "android")]
			android::register(_app, &_api)?;
			Ok(())
		})
		.build()
}

#[cfg(desktop)]
#[tauri::command]
pub async fn regional_settings(app: AppHandle) -> RegionalSettings {
	desktop::current(&app).await
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn regional_settings(app: AppHandle) -> serde_json::Value {
	android::current(&app).await
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn regional_settings() -> serde_json::Value {
	serde_json::Value::Null
}
