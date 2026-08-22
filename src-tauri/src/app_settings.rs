#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{AppHandle, Wry};

use crate::error::AppError;

#[cfg(target_os = "android")]
struct AndroidAppSettings {
	handle: PluginHandle<Wry>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("app-settings")
		.setup(|_app, _api| {
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.opengrind.appsettings",
					"AppSettingsPlugin",
				)?;
				_app.manage(AndroidAppSettings { handle });
			}
			Ok(())
		})
		.build()
}

#[tauri::command]
pub async fn open_app_settings(_app: AppHandle) -> Result<(), AppError> {
	#[cfg(target_os = "android")]
	{
		let handle = _app.state::<AndroidAppSettings>().handle.clone();
		handle
			.run_mobile_plugin_async::<serde_json::Value>("openAppSettings", ())
			.await
			.map_err(|error| {
				AppError::Http(format!("Could not open app settings: {error}"))
			})?;
		Ok(())
	}
	#[cfg(not(target_os = "android"))]
	Err(AppError::Http("Only available on Android".into()))
}
