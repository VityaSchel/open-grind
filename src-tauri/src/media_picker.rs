#[cfg(target_os = "android")]
use serde::{Deserialize, Serialize};
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{AppHandle, Wry};

use crate::error::AppError;

#[cfg(target_os = "android")]
struct AndroidMediaPicker {
	handle: PluginHandle<Wry>,
}

#[cfg(target_os = "android")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickRequest {
	mime_types: Vec<String>,
	multiple: bool,
}

#[cfg(target_os = "android")]
#[derive(Deserialize)]
struct PickResponse {
	uris: Option<Vec<String>>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("media-picker")
		.setup(|_app, _api| {
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.opengrind.picker",
					"MediaPickerPlugin",
				)?;
				_app.manage(AndroidMediaPicker { handle });
			}
			Ok(())
		})
		.build()
}

#[tauri::command]
pub async fn pick_android_media(
	_app: AppHandle,
	mime_types: Vec<String>,
	multiple: bool,
) -> Result<Option<Vec<String>>, AppError> {
	#[cfg(target_os = "android")]
	{
		let handle = _app.state::<AndroidMediaPicker>().handle.clone();
		let response: PickResponse = handle
			.run_mobile_plugin_async(
				"pickMedia",
				PickRequest {
					mime_types,
					multiple,
				},
			)
			.await
			.map_err(|error| {
				AppError::Media(format!(
					"Could not open the photo picker: {error}"
				))
			})?;
		Ok(response.uris)
	}
	#[cfg(not(target_os = "android"))]
	{
		let _ = (mime_types, multiple);
		Ok(None)
	}
}
