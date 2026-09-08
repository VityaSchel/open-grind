use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Manager, Wry};

pub struct AndroidFacebookOauth {
	pub handle: PluginHandle<Wry>,
}

/// The Activity only clears the profile on its next launch, so sign-out must.
pub async fn clear_profile(app: &AppHandle) {
	invoke(app, "clearProfile").await;
}

/// Closing the webview window does not finish the Activity hosting it.
pub async fn dismiss(app: &AppHandle) {
	invoke(app, "dismiss").await;
}

async fn invoke(app: &AppHandle, command: &str) {
	let handle = app.state::<AndroidFacebookOauth>().handle.clone();
	if let Err(e) = handle
		.run_mobile_plugin_async::<serde_json::Value>(command, ())
		.await
	{
		tracing::warn!("[fb-oauth] plugin command {command} failed: {e}");
	}
}
