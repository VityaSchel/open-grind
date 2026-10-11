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
use tauri::Wry;
#[cfg(desktop)]
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
pub use desktop::refresh_on_focus;
#[cfg(desktop)]
use desktop::{LastRead, RegionalSettings};

#[cfg(desktop)]
const CHANGED_EVENT: &str = "regional-settings-changed";

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("regional-settings")
		.setup(|_app, _api| {
			#[cfg(desktop)]
			_app.manage(LastRead::default());
			#[cfg(target_os = "macos")]
			apple::observe(_app.clone());
			Ok(())
		})
		.build()
}

#[cfg(desktop)]
#[tauri::command]
pub async fn regional_settings(app: AppHandle) -> RegionalSettings {
	desktop::current(&app).await
}

#[cfg(mobile)]
#[tauri::command]
pub async fn regional_settings() -> serde_json::Value {
	serde_json::Value::Null
}
