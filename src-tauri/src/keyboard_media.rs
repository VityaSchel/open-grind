use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginApi, TauriPlugin};
use tauri::{AppHandle, Emitter, Wry};

use crate::upload::staged::StagedMedia;

const KEYBOARD_MEDIA_EVENT: &str = "keyboard-media";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Staged {
	id: Option<String>,
	mime_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	directory: PathBuf,
	on_event: tauri::ipc::Channel<Staged>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("keyboard-media")
		.setup(|app, api| watch(app, &api))
		.build()
}

fn watch(
	app: &AppHandle,
	api: &PluginApi<Wry, ()>,
) -> Result<(), Box<dyn std::error::Error>> {
	let handle = api.register_android_plugin(
		"org.opengrind.keyboard",
		"KeyboardMediaPlugin",
	)?;
	let sink = app.clone();
	let on_event = tauri::ipc::Channel::new(move |body| {
		let staged: Staged = body.deserialize()?;
		let _ = sink.emit(KEYBOARD_MEDIA_EVENT, staged);
		Ok(())
	});
	let directory = StagedMedia::of(app)?.directory().to_path_buf();
	handle.run_mobile_plugin::<serde_json::Value>(
		"watch",
		WatchRequest {
			directory,
			on_event,
		},
	)?;
	Ok(())
}
