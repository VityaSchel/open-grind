use std::sync::Arc;

use base64::Engine;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::error::AppError;

use super::GoogleOauthBridge;

const HELPER_URL: &str = "https://web.grindr.com/";
const HELPER_HOST: &str = "web.grindr.com";
const WINDOW_LABEL: &str = "google-oauth";

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
     AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const RESULT_PATH: &str = "/__open_grind_oauth__";

/// A host allowlist cancels the third-party frames Google's sign-in loads
/// Nonce and exact result URL keep a foreign origin from token
const REFUSED_SCHEMES: [&str; 2] = ["file", "javascript"];

const OAUTH_UI_CSS: &str = include_str!(concat!(
	env!("CARGO_MANIFEST_DIR"),
	"/vendor/grindr-google-oauth-webextension/shared/oauth-ui.css"
));

const PRELUDE: &str = concat!(
	include_str!(concat!(
		env!("CARGO_MANIFEST_DIR"),
		"/vendor/grindr-google-oauth-webextension/shared/gis-core.js"
	)),
	"\n",
	include_str!(concat!(
		env!("CARGO_MANIFEST_DIR"),
		"/vendor/grindr-google-oauth-webextension/shared/oauth-ui.js"
	))
);

const OAUTH_INIT: &str = include_str!("oauth_init.js");

fn new_nonce() -> String {
	let mut bytes = [0u8; 32];
	getrandom::fill(&mut bytes).expect("system randomness unavailable");
	base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn init_script(nonce: &str) -> String {
	let config = serde_json::json!({ "css": OAUTH_UI_CSS, "nonce": nonce });
	format!("{PRELUDE}\n({OAUTH_INIT})({config});")
}

fn is_allowed_target(url: &Url) -> bool {
	!REFUSED_SCHEMES.contains(&url.scheme())
}

fn is_result_url(url: &Url) -> bool {
	url.host_str() == Some(HELPER_HOST) && url.path() == RESULT_PATH
}

fn without_query(url: &Url) -> String {
	let mut url = url.clone();
	url.set_query(None);
	url.set_fragment(None);
	url.into()
}

fn result_from_query(url: &Url, nonce: &str) -> Option<Result<String, String>> {
	let mut nonce_matched = false;
	let mut result = None;
	for (key, value) in url.query_pairs() {
		match key.as_ref() {
			"nonce" => nonce_matched = value == nonce,
			"token" => result = Some(Ok(value.into_owned())),
			"error" => result = Some(Err(value.into_owned())),
			_ => {}
		}
	}
	nonce_matched.then_some(result).flatten()
}

pub async fn fetch_access_token(
	app: &AppHandle,
	bridge: Arc<GoogleOauthBridge>,
) -> Result<String, AppError> {
	let rx = bridge.begin()?;
	run_flow(app, &bridge, rx).await.inspect_err(|_| {
		bridge.abort();
	})
}

async fn run_flow(
	app: &AppHandle,
	bridge: &Arc<GoogleOauthBridge>,
	rx: oneshot::Receiver<Result<String, String>>,
) -> Result<String, AppError> {
	if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
		let _ = existing.close();
	}

	let url = Url::parse(HELPER_URL)
		.map_err(|e| AppError::Http(format!("invalid helper URL: {e}")))?;

	let nonce = new_nonce();
	let bridge_for_nav = bridge.clone();
	let nonce_for_nav = nonce.clone();

	#[allow(unused_mut)]
	let mut builder =
		WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
			.title("Sign in with Google")
			.inner_size(500.0, 720.0)
			.user_agent(USER_AGENT)
			.initialization_script(init_script(&nonce))
			.incognito(true)
			.general_autofill_enabled(false)
			.on_navigation(move |url| {
				if !is_allowed_target(url) {
					tracing::warn!(
						"[oauth] refused navigation to {}",
						without_query(url)
					);
					return false;
				}
				tracing::debug!("[oauth] navigating to {}", without_query(url));
				if !is_result_url(url) {
					return true;
				}
				if let Some(result) = result_from_query(url, &nonce_for_nav) {
					bridge_for_nav.fulfill(result);
				}
				false
			});

	// `incognito` silently no-ops on WebView2 older than 101.0.1210.39
	// https://docs.rs/wry/latest/src/wry/lib.rs.html#1440-1443
	#[cfg(target_os = "windows")]
	{
		builder = builder.data_directory(oauth_data_dir(app, &nonce)?);
	}

	let window = builder.build().map_err(|e| {
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

	let _ = window.clear_all_browsing_data();
	let _ = window.close();

	result.map_err(AppError::Auth)
}

#[cfg(target_os = "windows")]
fn oauth_data_dir(
	app: &AppHandle,
	nonce: &str,
) -> Result<std::path::PathBuf, AppError> {
	let root = app
		.path()
		.app_local_data_dir()
		.map_err(|e| AppError::Http(format!("no local data dir: {e}")))?;
	let name: String = nonce
		.chars()
		.filter(char::is_ascii_alphanumeric)
		.take(16)
		.collect();
	Ok(root.join(OAUTH_DATA_SUBDIR).join(name))
}

#[cfg(target_os = "windows")]
const OAUTH_DATA_SUBDIR: &str = "oauth-webview";

/// WebView2 locks the folder while the window lives, so sweep at next launch.
#[cfg(target_os = "windows")]
pub fn sweep_oauth_data_dirs(app: &AppHandle) {
	let Ok(root) = app.path().app_local_data_dir() else {
		return;
	};
	let Ok(entries) = std::fs::read_dir(root.join(OAUTH_DATA_SUBDIR)) else {
		return;
	};
	for entry in entries.flatten() {
		if let Err(e) = std::fs::remove_dir_all(entry.path()) {
			tracing::warn!("could not remove stale sign-in profile: {e}");
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn allows(url: &str) -> bool {
		is_allowed_target(&Url::parse(url).unwrap())
	}

	fn result_of(url: &str, nonce: &str) -> Option<Result<String, String>> {
		result_from_query(&Url::parse(url).unwrap(), nonce)
	}

	#[test]
	fn never_cancels_a_step_of_the_sign_in_flow() {
		for url in [
			"https://web.grindr.com/",
			"https://accounts.google.com/o/oauth2/auth",
			"https://accounts.youtube.com/accounts/SetSID",
			"https://www.google.com/recaptcha/enterprise/anchor",
			"https://ssl.gstatic.com/accounts/static/lso.js",
			"about:blank",
			"about:srcdoc",
		] {
			assert!(allows(url), "{url} is part of the flow and must load");
		}
	}

	#[test]
	fn refuses_schemes_that_cannot_be_part_of_the_flow() {
		for url in ["file:///etc/passwd", "javascript:alert(1)"] {
			assert!(
				!allows(url),
				"{url} must never load in the sign-in window"
			);
		}
	}

	#[test]
	fn accepts_a_result_carrying_the_matching_nonce() {
		let result = result_of(
			"https://web.grindr.com/__open_grind_oauth__?nonce=abc&token=t0ken",
			"abc",
		);
		assert_eq!(result, Some(Ok("t0ken".to_string())));
	}

	#[test]
	fn rejects_a_result_whose_nonce_is_wrong_or_absent() {
		for url in [
			"https://web.grindr.com/__open_grind_oauth__?nonce=nope&token=t0ken",
			"https://web.grindr.com/__open_grind_oauth__?token=t0ken",
			"https://web.grindr.com/__open_grind_oauth__?nonce=&token=t0ken",
			"https://web.grindr.com/__open_grind_oauth__?error=denied",
		] {
			assert_eq!(result_of(url, "abc"), None, "{url} must be ignored");
		}
	}

	#[test]
	fn a_nonce_is_unpredictable_and_url_safe() {
		let (a, b) = (new_nonce(), new_nonce());
		assert_ne!(a, b);
		assert!(a
			.chars()
			.all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
		assert!(a.len() >= 32);
	}

	#[test]
	fn the_init_script_never_parks_the_nonce_on_window() {
		let script = init_script("s3cret");
		assert!(script.contains("\"nonce\":\"s3cret\""));
		assert!(!script.contains("window.__grindrOauthCss"));
	}

	#[test]
	fn a_logged_url_keeps_no_token_or_nonce() {
		let logged = without_query(
			&Url::parse(
				"https://web.grindr.com/__open_grind_oauth__?nonce=abc&token=t0ken#frag",
			)
			.unwrap(),
		);
		assert_eq!(logged, "https://web.grindr.com/__open_grind_oauth__");
	}

	#[test]
	fn identifies_only_the_result_path() {
		let is_result = |u: &str| is_result_url(&Url::parse(u).unwrap());
		assert!(is_result("https://web.grindr.com/__open_grind_oauth__?x=1"));
		assert!(!is_result("https://web.grindr.com/"));
		assert!(!is_result(
			"https://accounts.google.com/__open_grind_oauth__"
		));
	}
}
