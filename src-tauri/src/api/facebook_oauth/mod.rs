#[cfg(target_os = "android")]
mod android;
mod dialog;
mod web;

use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::api::oauth::{OauthBridge, OauthProvider};
use crate::error::AppError;

pub struct Facebook;

impl OauthProvider for Facebook {
	const NAME: &'static str = "Facebook";
}

pub type FacebookOauthBridge = OauthBridge<Facebook>;

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
	tauri::plugin::Builder::new("facebook-oauth")
		.setup(|app, _api| {
			app.manage(Arc::new(FacebookOauthBridge::new()));
			#[cfg(target_os = "android")]
			{
				let handle = _api.register_android_plugin(
					"org.opengrind.facebookoauth",
					"FacebookOauthPlugin",
				)?;
				app.manage(android::AndroidFacebookOauth { handle });
			}
			#[cfg(target_os = "windows")]
			crate::api::oauth::sweep_oauth_data_dirs(app);
			Ok(())
		})
		.build()
}

pub async fn forget_sign_in_profile(app: &AppHandle) {
	#[cfg(target_os = "android")]
	android::clear_profile(app).await;
	#[cfg(not(target_os = "android"))]
	let _ = app;
}

pub async fn fetch_facebook_access_token(
	app: &AppHandle,
) -> Result<String, AppError> {
	let bridge = app.state::<Arc<FacebookOauthBridge>>().inner().clone();
	web::fetch_access_token(app, bridge).await
}
