use serde_json::json;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use super::SERVED_HOSTNAME;

const LEGACY_ORIGIN: &str = "http://tauri.localhost";

struct AppOrigin(PluginHandle<Wry>);

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("app-origin")
		.setup(|app, api| {
			let handle = api.register_android_plugin(
				"org.opengrind.apporigin",
				"AppOriginPlugin",
			)?;
			app.manage(AppOrigin(handle));
			Ok(())
		})
		.build()
}

pub fn prepare_served_origin(app: &AppHandle) {
	let Some(hostname) = SERVED_HOSTNAME else {
		return;
	};
	let plugin = &app.state::<AppOrigin>().0;
	for (command, args) in [
		("exemptFromSafeBrowsing", json!({ "host": hostname })),
		(
			"moveLocalStorage",
			json!({ "from": LEGACY_ORIGIN, "to": format!("https://{hostname}") }),
		),
	] {
		if let Err(error) =
			plugin.run_mobile_plugin::<serde_json::Value>(command, args)
		{
			tracing::warn!("[app-origin] {command} failed: {error}");
		}
	}
}
