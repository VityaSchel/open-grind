use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Emitter, Manager, Wry};

use super::CHANGED_EVENT;

struct AndroidAppLanguage(PluginHandle<Wry>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	on_change: Channel<Value>,
}

#[derive(Serialize)]
struct LanguageRequest {
	tag: Option<String>,
}

pub fn register(
	app: &AppHandle,
	api: &PluginApi<Wry, ()>,
) -> Result<(), Box<dyn std::error::Error>> {
	let handle = api.register_android_plugin(
		"org.opengrind.language",
		"AppLanguagePlugin",
	)?;
	let sink = app.clone();
	let on_change = Channel::new(move |body| {
		let _ = sink.emit(CHANGED_EVENT, body.deserialize::<Value>()?);
		Ok(())
	});
	if let Err(error) = handle.run_mobile_plugin::<Value>(
		"watchAppLanguages",
		WatchRequest { on_change },
	) {
		tracing::warn!("[app-language] change events unavailable: {error}");
	}
	app.manage(AndroidAppLanguage(handle));
	Ok(())
}

pub async fn current(app: &AppHandle) -> Value {
	let handle = app.state::<AndroidAppLanguage>().0.clone();
	handle
		.run_mobile_plugin_async::<Value>("getAppLanguages", ())
		.await
		.unwrap_or_else(|error| {
			tracing::warn!("[app-language] languages unavailable: {error}");
			Value::Null
		})
}

pub async fn set(app: &AppHandle, tag: Option<String>) -> Result<(), String> {
	let handle = app.state::<AndroidAppLanguage>().0.clone();
	handle
		.run_mobile_plugin_async::<Value>(
			"setAppLanguage",
			LanguageRequest { tag },
		)
		.await
		.map(drop)
		.map_err(|error| error.to_string())
}
