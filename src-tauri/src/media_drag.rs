use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginApi, TauriPlugin};
use tauri::{AppHandle, Emitter, Wry};

const MEDIA_DRAG_EVENT: &str = "media-drag";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Drag {
	mime_types: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	on_event: tauri::ipc::Channel<Drag>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("media-drag")
		.setup(|app, api| watch(app, &api))
		.build()
}

fn watch(
	app: &AppHandle,
	api: &PluginApi<Wry, ()>,
) -> Result<(), Box<dyn std::error::Error>> {
	let handle =
		api.register_android_plugin("org.opengrind.drag", "MediaDragPlugin")?;
	let sink = app.clone();
	let on_event = tauri::ipc::Channel::new(move |body| {
		let drag: Drag = body.deserialize()?;
		let _ = sink.emit(MEDIA_DRAG_EVENT, drag);
		Ok(())
	});
	handle.run_mobile_plugin::<serde_json::Value>(
		"watch",
		WatchRequest { on_event },
	)?;
	Ok(())
}
