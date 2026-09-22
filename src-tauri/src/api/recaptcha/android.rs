use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use super::{RecaptchaAction, RecaptchaError};
use crate::plugin_rejection::classify;

struct AndroidRecaptcha {
	handle: PluginHandle<Wry>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("recaptcha")
		.setup(|app, api| {
			let handle = api.register_android_plugin(
				"org.opengrind.recaptcha",
				"RecaptchaPlugin",
			)?;
			app.manage(AndroidRecaptcha { handle });
			Ok(())
		})
		.build()
}

#[derive(Serialize)]
struct MintRequest {
	action: &'static str,
}

#[derive(Deserialize)]
struct MintResponse {
	token: String,
}

pub async fn mint_token(
	app: &AppHandle,
	action: RecaptchaAction,
) -> Result<String, RecaptchaError> {
	let handle = app
		.try_state::<AndroidRecaptcha>()
		.ok_or(RecaptchaError::Failed)?
		.handle
		.clone();
	let response: MintResponse = handle
		.run_mobile_plugin_async(
			"mintToken",
			MintRequest {
				action: action.as_str(),
			},
		)
		.await
		.map_err(|error| classify(error, RecaptchaError::from_rejection))?;
	Ok(response.token)
}
