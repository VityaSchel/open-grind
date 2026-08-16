#[cfg(target_os = "android")]
mod android;
#[cfg(not(target_os = "android"))]
mod web;

use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[cfg(not(target_os = "android"))]
use std::sync::{Arc, Mutex};
#[cfg(not(target_os = "android"))]
use tokio::sync::oneshot;

#[cfg(not(target_os = "android"))]
pub struct GoogleOauthBridge {
	pending: Mutex<Option<oneshot::Sender<Result<String, String>>>>,
}

#[cfg(not(target_os = "android"))]
impl Default for GoogleOauthBridge {
	fn default() -> Self {
		Self::new()
	}
}

#[cfg(not(target_os = "android"))]
impl GoogleOauthBridge {
	pub fn new() -> Self {
		Self {
			pending: Mutex::new(None),
		}
	}

	fn begin(
		&self,
	) -> Result<oneshot::Receiver<Result<String, String>>, AppError> {
		let mut pending = self.pending.lock().unwrap();
		if pending.is_some() {
			return Err(AppError::Auth(
				"Google sign-in already in progress".into(),
			));
		}
		let (tx, rx) = oneshot::channel();
		*pending = Some(tx);
		Ok(rx)
	}

	fn fulfill(&self, result: Result<String, String>) {
		if let Some(tx) = self.pending.lock().unwrap().take() {
			let _ = tx.send(result);
		}
	}

	fn abort(&self) {
		let _ = self.pending.lock().unwrap().take();
	}
}

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
			}
			#[cfg(not(target_os = "android"))]
			{
				_app.manage(Arc::new(GoogleOauthBridge::new()));
			}
			#[cfg(target_os = "windows")]
			web::sweep_oauth_data_dirs(_app);
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

#[cfg(all(test, not(target_os = "android")))]
mod tests {
	use super::*;

	#[test]
	fn refuses_a_second_flow_while_one_is_pending() {
		let bridge = GoogleOauthBridge::new();
		let _rx = bridge.begin().expect("first flow starts");
		assert!(bridge.begin().is_err());
	}

	#[test]
	fn delivering_a_result_frees_the_slot_for_the_next_attempt() {
		let bridge = GoogleOauthBridge::new();
		let _rx = bridge.begin().expect("first flow starts");
		bridge.fulfill(Ok("token".into()));
		assert!(bridge.begin().is_ok());
	}

	#[test]
	fn aborting_frees_the_slot_so_a_failed_setup_stays_retryable() {
		let bridge = GoogleOauthBridge::new();
		let _rx = bridge.begin().expect("first flow starts");
		bridge.abort();
		assert!(
			bridge.begin().is_ok(),
			"a setup failure must not wedge sign-in for the whole session"
		);
	}
}
