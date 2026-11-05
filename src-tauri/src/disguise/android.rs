use serde::Deserialize;
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Manager, Wry};

use super::DisguiseError;

struct AndroidDisguise(PluginHandle<Wry>);

#[derive(Deserialize)]
struct Current {
	id: String,
}

pub(super) fn register(
	app: &AppHandle,
	api: &PluginApi<Wry, ()>,
) -> Result<(), Box<dyn std::error::Error>> {
	let handle = api
		.register_android_plugin("org.opengrind.disguise", "DisguisePlugin")?;
	app.manage(AndroidDisguise(handle));
	Ok(())
}

fn handle(app: &AppHandle) -> PluginHandle<Wry> {
	app.state::<AndroidDisguise>().0.clone()
}

pub(super) async fn current(app: &AppHandle) -> Result<String, DisguiseError> {
	handle(app)
		.run_mobile_plugin_async::<Current>("current", ())
		.await
		.map(|current| current.id)
		.map_err(|error| DisguiseError::new(error.to_string()))
}

pub(super) async fn select(
	app: &AppHandle,
	id: &str,
) -> Result<(), DisguiseError> {
	handle(app)
		.run_mobile_plugin_async::<serde_json::Value>(
			"select",
			serde_json::json!({ "id": id }),
		)
		.await
		.map(|_| ())
		.map_err(|error| DisguiseError::new(error.to_string()))
}
