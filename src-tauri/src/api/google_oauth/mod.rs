#[cfg(target_os = "android")]
mod android;
#[cfg(not(target_os = "android"))]
mod web;

use tauri::{AppHandle, Manager};

use crate::api::oauth::{OauthBridge, OauthProvider};
use crate::error::AppError;

#[cfg(not(target_os = "android"))]
use std::sync::Arc;

pub struct Google;

impl OauthProvider for Google {
	const NAME: &'static str = "Google";
}

pub type GoogleOauthBridge = OauthBridge<Google>;

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
	tauri::plugin::Builder::new("google-oauth")
		.setup(|_app, _api| {
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.opengrind.googleoauth",
					"GoogleOauthPlugin",
				)?;
				_app.manage(android::AndroidGoogleOauth { handle });
				watch_handoff(_app);
			}
			#[cfg(not(target_os = "android"))]
			{
				_app.manage(Arc::new(GoogleOauthBridge::new()));
			}
			#[cfg(target_os = "windows")]
			crate::api::oauth::sweep_oauth_data_dirs(_app);
			Ok(())
		})
		.build()
}

pub async fn fetch_google_access_token(
	app: &AppHandle,
) -> Result<String, AppError> {
	#[cfg(target_os = "android")]
	{
		return android::fetch_companion_token(app).await;
	}
	#[cfg(not(target_os = "android"))]
	{
		let bridge = app.state::<Arc<GoogleOauthBridge>>().inner().clone();
		web::fetch_access_token(app, bridge).await
	}
}

pub const HANDOFF_EVENT: &str = "google-oauth:handoff";

#[cfg(target_os = "android")]
fn watch_handoff(app: &AppHandle) {
	use tauri::Emitter;

	let sink = app.clone();
	let channel = tauri::ipc::Channel::new(move |body| {
		let signal: android::HandoffSignal = body.deserialize()?;
		if signal.pending {
			let _ = sink.emit(HANDOFF_EVENT, ());
		}
		Ok(())
	});
	if let Err(error) = android::watch_handoff(app, channel) {
		tracing::warn!("[google-oauth] handoff events unavailable: {error}");
	}
}

pub fn handoff_pending(app: &AppHandle) -> bool {
	#[cfg(target_os = "android")]
	{
		android::handoff_pending(app)
	}
	#[cfg(not(target_os = "android"))]
	{
		let _ = app;
		false
	}
}

pub fn take_handoff(app: &AppHandle) -> Option<String> {
	#[cfg(target_os = "android")]
	{
		android::take_handoff(app)
	}
	#[cfg(not(target_os = "android"))]
	{
		let _ = app;
		None
	}
}

pub fn discard_handoff(app: &AppHandle) {
	#[cfg(target_os = "android")]
	{
		android::discard_handoff(app);
	}
	#[cfg(not(target_os = "android"))]
	{
		let _ = app;
	}
}
