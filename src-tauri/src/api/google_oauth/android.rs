use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Manager, Wry};

use crate::error::AppError;

/// Handle to the `GoogleOauthPlugin` registered on the Android side, stored in Tauri
/// state so [`fetch_token`] can invoke it.
pub struct AndroidGoogleOauth {
	pub handle: PluginHandle<Wry>,
}

#[derive(serde::Deserialize)]
struct TokenResponse {
	token: String,
}

/// Launches the companion app (via the Android plugin) and returns the access token.
pub async fn fetch_token(app: &AppHandle) -> Result<String, AppError> {
	let handle = app.state::<AndroidGoogleOauth>().handle.clone();
	let response: TokenResponse = handle
		.run_mobile_plugin_async("getToken", ())
		.await
		.map_err(map_plugin_error)?;
	Ok(response.token)
}

/// Maps the Kotlin-side rejection markers to app errors. `companion-unavailable`
/// tells the frontend to fall back to the manual paste page; `companion-untrusted`
/// says a package holding the companion's name is signed by someone else;
/// `cancelled` is silent.
fn map_plugin_error(error: PluginInvokeError) -> AppError {
	if let PluginInvokeError::InvokeRejected(response) = &error {
		match response.message.as_deref() {
			Some("companion-unavailable") => {
				return AppError::Auth("companion-unavailable".into());
			}
			Some("companion-untrusted") => {
				return AppError::Auth("companion-untrusted".into());
			}
			Some("cancelled") => {
				return AppError::Auth("Sign-in canceled".into())
			}
			_ => {}
		}
	}
	AppError::Auth("Google sign-in failed".into())
}
