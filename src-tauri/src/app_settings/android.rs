use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use crate::error::AppError;

struct AndroidAppSettings {
	handle: PluginHandle<Wry>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("app-settings")
		.setup(|app, api| {
			let handle = api.register_android_plugin(
				"org.opengrind.appsettings",
				"AppSettingsPlugin",
			)?;
			app.manage(AndroidAppSettings { handle });
			Ok(())
		})
		.build()
}

#[tauri::command]
pub async fn open_app_settings(app: AppHandle) -> Result<(), AppError> {
	let handle = app.state::<AndroidAppSettings>().handle.clone();
	handle
		.run_mobile_plugin_async::<serde_json::Value>("openAppSettings", ())
		.await
		.map_err(|error| {
			AppError::Http(format!("Could not open app settings: {error}"))
		})?;
	Ok(())
}
