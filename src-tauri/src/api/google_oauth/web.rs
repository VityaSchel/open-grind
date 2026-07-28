use std::sync::Arc;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppError;

use super::GoogleOauthBridge;

const HELPER_URL: &str = "https://web.grindr.com/";
const WINDOW_LABEL: &str = "google-oauth";

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
     AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const RESULT_PATH: &str = "/__open_grind_oauth__";

const OAUTH_UI_CSS: &str = include_str!(concat!(
	env!("CARGO_MANIFEST_DIR"),
	"/vendor/grindr-google-oauth-webextension/shared/oauth-ui.css"
));

const INIT_SCRIPT: &str = concat!(
	include_str!(concat!(
		env!("CARGO_MANIFEST_DIR"),
		"/vendor/grindr-google-oauth-webextension/shared/gis-core.js"
	)),
	"\n",
	include_str!(concat!(
		env!("CARGO_MANIFEST_DIR"),
		"/vendor/grindr-google-oauth-webextension/shared/oauth-ui.js"
	)),
	"\n",
	include_str!("oauth_init.js")
);

fn init_script() -> String {
	let css = serde_json::to_string(OAUTH_UI_CSS)
		.unwrap_or_else(|_| "\"\"".to_string());
	format!("window.__grindrOauthCss = {css};\n{INIT_SCRIPT}")
}

pub async fn fetch_access_token(
	app: &AppHandle,
	bridge: Arc<GoogleOauthBridge>,
) -> Result<String, AppError> {
	let rx = bridge.begin()?;

	if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
		let _ = existing.close();
	}

	let url = Url::parse(HELPER_URL).map_err(|e| {
		bridge.fulfill(Err(format!("invalid helper URL: {e}")));
		AppError::Http(format!("invalid helper URL: {e}"))
	})?;

	let bridge_for_nav = bridge.clone();
	let window =
		WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
			.title("Sign in with Google")
			.inner_size(500.0, 720.0)
			.user_agent(USER_AGENT)
			.initialization_script(init_script())
			.on_navigation(move |url| {
				if url.host_str() != Some("web.grindr.com")
					|| url.path() != RESULT_PATH
				{
					return true;
				}
				for (key, value) in url.query_pairs() {
					match key.as_ref() {
						"token" => {
							bridge_for_nav.fulfill(Ok(value.into_owned()))
						}
						"error" => {
							bridge_for_nav.fulfill(Err(value.into_owned()))
						}
						_ => {}
					}
				}
				false
			})
			.build()
			.map_err(|e| {
				bridge.fulfill(Err(format!(
					"failed to open sign-in window: {e}"
				)));
				AppError::Http(format!("failed to open sign-in window: {e}"))
			})?;

	let bridge_for_close = bridge.clone();
	window.on_window_event(move |event| {
		if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
			bridge_for_close.fulfill(Err("Sign-in canceled".to_string()));
		}
	});

	let result = rx.await.map_err(|_| {
		AppError::Auth("sign-in flow ended unexpectedly".into())
	})?;

	let _ = window.close();

	result.map_err(AppError::Auth)
}
