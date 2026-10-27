use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use crate::error::AppError;

struct AndroidMediaPicker {
	handle: PluginHandle<Wry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickRequest {
	mime_types: Vec<String>,
	multiple: bool,
}

#[derive(Deserialize)]
struct PickResponse {
	uris: Option<Vec<String>>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("media-picker")
		.setup(|app, api| {
			let handle = api.register_android_plugin(
				"org.opengrind.picker",
				"MediaPickerPlugin",
			)?;
			app.manage(AndroidMediaPicker { handle });
			Ok(())
		})
		.build()
}

#[tauri::command]
pub async fn pick_android_media(
	app: AppHandle,
	mime_types: Vec<String>,
	multiple: bool,
) -> Result<Option<Vec<String>>, AppError> {
	let handle = app.state::<AndroidMediaPicker>().handle.clone();
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
			AppError::Media(format!("Could not open the photo picker: {error}"))
		})?;
	Ok(response.uris)
}
