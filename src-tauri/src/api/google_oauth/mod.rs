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

/// Registers the Google OAuth plugin and its per-platform state. On Android it binds
/// the native `GoogleOauthPlugin` (companion-app intent hand-off); on desktop it
/// manages the [`GoogleOauthBridge`] used by the WebView flow in [`web`].
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
				watch_handback(_app);
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
		return android::fetch_token(app).await;
	}
	#[cfg(not(target_os = "android"))]
	{
		let bridge = app.state::<Arc<GoogleOauthBridge>>().inner().clone();
		web::fetch_access_token(app, bridge).await
	}
}

pub const HANDBACK_EVENT: &str = "google-oauth:handback";

#[cfg(target_os = "android")]
fn watch_handback(app: &AppHandle) {
	use tauri::Emitter;

	let sink = app.clone();
	let channel = tauri::ipc::Channel::new(move |body| {
		let signal: android::HandoffSignal = body.deserialize()?;
		if signal.pending {
			let _ = sink.emit(HANDBACK_EVENT, ());
		}
		Ok(())
	});
	if let Err(error) = android::watch_handoff(app, channel) {
		tracing::warn!("[google-oauth] handback events unavailable: {error}");
	}
}

pub fn handback_pending(app: &AppHandle) -> bool {
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

pub fn take_handback(app: &AppHandle) -> Option<String> {
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

pub fn discard_handback(app: &AppHandle) {
	#[cfg(target_os = "android")]
	{
		android::discard_handoff(app);
	}
	#[cfg(not(target_os = "android"))]
	{
		let _ = app;
	}
}
