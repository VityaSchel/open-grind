use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Emitter, Manager, Wry};

use super::CHANGED_EVENT;

struct AndroidRegionalSettings(PluginHandle<Wry>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	on_change: Channel<Value>,
}

pub fn register(
	app: &AppHandle,
	api: &PluginApi<Wry, ()>,
) -> Result<(), Box<dyn std::error::Error>> {
	let handle = api.register_android_plugin(
		"org.opengrind.region",
		"RegionalSettingsPlugin",
	)?;
	let sink = app.clone();
	let on_change = Channel::new(move |body| {
		let _ = sink.emit(CHANGED_EVENT, body.deserialize::<Value>()?);
		Ok(())
	});
	if let Err(error) = handle.run_mobile_plugin::<Value>(
		"watchRegionalSettings",
		WatchRequest { on_change },
	) {
		tracing::warn!("[regional] change events unavailable: {error}");
	}
	app.manage(AndroidRegionalSettings(handle));
	Ok(())
}

pub async fn current(app: &AppHandle) -> Value {
	let handle = app.state::<AndroidRegionalSettings>().0.clone();
	handle
		.run_mobile_plugin_async::<Value>("getRegionalSettings", ())
		.await
		.unwrap_or_else(|error| {
			tracing::warn!("[regional] settings unavailable: {error}");
			Value::Null
		})
}
