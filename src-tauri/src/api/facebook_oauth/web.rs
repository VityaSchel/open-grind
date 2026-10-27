use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::error::AppError;

use crate::api::oauth::{
	is_allowed_target, new_nonce, sign_in_user_agent, without_secrets,
	SignInPage, CANCELED,
};

use super::dialog::{
	dialog_url, is_redirect_url, result_from_redirect, HANDOFF_REFUSED,
};
use super::FacebookOauthBridge;

const WINDOW_LABEL: &str = "facebook-oauth";

const FLOW_TIMEOUT: std::time::Duration =
	std::time::Duration::from_secs(10 * 60);

#[cfg(desktop)]
const WINDOW_INNER_SIZE: (f64, f64) = (600.0, 700.0);
#[cfg(mobile)]
const WINDOW_INNER_SIZE: (f64, f64) = (500.0, 720.0);

pub async fn fetch_access_token(
	app: &AppHandle,
	bridge: Arc<FacebookOauthBridge>,
) -> Result<String, AppError> {
	let rx = bridge.begin()?;
	run_flow(app, &bridge, rx).await.inspect_err(|_| {
		bridge.abort();
	})
}

async fn run_flow(
	app: &AppHandle,
	bridge: &Arc<FacebookOauthBridge>,
	rx: oneshot::Receiver<Result<String, String>>,
) -> Result<String, AppError> {
	if let Some(stale) = app.get_webview_window(WINDOW_LABEL) {
		let _ = stale.close();
	}

	let state = new_nonce();
	let (window_width, window_height) = WINDOW_INNER_SIZE;
	let bridge_for_nav = bridge.clone();
	let state_for_nav = state.clone();

	let mut builder = WebviewWindowBuilder::new(
		app,
		WINDOW_LABEL,
		WebviewUrl::External(dialog_url(&state)?),
	)
	.title("Sign in with Facebook")
	.inner_size(window_width, window_height)
	.incognito(true)
	.general_autofill_enabled(false)
	.on_navigation(move |url| {
		if !is_allowed_target(url) {
			tracing::warn!("[fb-oauth] refused {}", without_secrets(url));
			bridge_for_nav.fulfill(Err(HANDOFF_REFUSED.to_owned()));
			return false;
		}
		if !is_redirect_url(url) {
			tracing::debug!("[fb-oauth] navigating {}", without_secrets(url));
			return true;
		}
		if let Some(result) = result_from_redirect(url, &state_for_nav) {
			bridge_for_nav.fulfill(result);
		}
		false
	});

	if let Some(user_agent) = sign_in_user_agent(SignInPage::Facebook) {
		builder = builder.user_agent(&user_agent);
	}

	#[cfg(target_os = "android")]
	{
		builder = builder
			.activity_name("FacebookOauthActivity")
			.created_by_activity_name("MainActivity");
	}

	#[cfg(target_os = "windows")]
	{
		builder = builder
			.data_directory(crate::api::oauth::oauth_data_dir(app, &state)?);
	}

	#[cfg(target_os = "ios")]
	{
		builder = builder
			.visible(false)
			.background_color(tauri::window::Color(10, 10, 10, 255));
	}

	let window = builder.build().map_err(|e| {
		AppError::Http(format!("failed to open sign-in window: {e}"))
	})?;

	#[cfg(target_os = "ios")]
	if let Err(e) =
		crate::api::oauth::sheet::present(&window, "Sign in with Facebook")
			.await
	{
		bridge.fulfill(Err(format!(
			"{}: {e}",
			crate::api::oauth::sheet::UNAVAILABLE
		)));
	}

	let bridge_for_close = bridge.clone();
	window.on_window_event(move |event| {
		if matches!(
			event,
			tauri::WindowEvent::CloseRequested { .. }
				| tauri::WindowEvent::Destroyed
		) {
			bridge_for_close.fulfill(Err(CANCELED.to_owned()));
		}
	});

	let result = match tokio::time::timeout(FLOW_TIMEOUT, rx).await {
		Ok(Ok(result)) => result,
		Ok(Err(_)) => {
			dismiss_window(app).await;
			return Err(AppError::Auth(
				"sign-in flow ended unexpectedly".into(),
			));
		}
		Err(_) => Err("Sign-in timed out".to_owned()),
	};

	dismiss_window(app).await;

	result.map_err(AppError::Auth)
}

async fn dismiss_window(app: &AppHandle) {
	if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
		let _ = window.clear_all_browsing_data();
		let _ = window.close();
	}
	#[cfg(target_os = "android")]
	super::android::dismiss(app).await;
}
