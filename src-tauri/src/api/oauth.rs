use std::marker::PhantomData;
use std::sync::Mutex;

use base64::Engine;
use tauri::Url;
use tokio::sync::oneshot;

use crate::error::AppError;

/// Matched verbatim by the frontend, which stays silent for it.
pub const CANCELED: &str = "Sign-in canceled";

pub const COMPANION_UNAVAILABLE: &str = "companion-unavailable";
pub const COMPANION_UNTRUSTED: &str = "companion-untrusted";
pub const COMPANION_REFUSED: &str = "companion-refused";
pub const COMPANION_DISABLED: &str = "companion-disabled";
pub const COMPANION_FAILED: &str = "companion-failed";
const COMPANION_CANCELLED: &str = "cancelled";

pub trait OauthProvider: Send + Sync + 'static {
	const NAME: &'static str;
}

/// The type parameter gives each provider its own Tauri state key.
pub struct OauthBridge<P: OauthProvider> {
	pending: Mutex<Option<oneshot::Sender<Result<String, String>>>>,
	provider: PhantomData<P>,
}

impl<P: OauthProvider> Default for OauthBridge<P> {
	fn default() -> Self {
		Self::new()
	}
}

impl<P: OauthProvider> OauthBridge<P> {
	pub fn new() -> Self {
		Self {
			pending: Mutex::new(None),
			provider: PhantomData,
		}
	}

	pub(crate) fn begin(
		&self,
	) -> Result<oneshot::Receiver<Result<String, String>>, AppError> {
		let mut pending = self.pending.lock().unwrap();
		if pending.is_some() {
			return Err(AppError::Auth(format!(
				"{} sign-in already in progress",
				P::NAME
			)));
		}
		let (tx, rx) = oneshot::channel();
		*pending = Some(tx);
		Ok(rx)
	}

	pub(crate) fn fulfill(&self, result: Result<String, String>) {
		if let Some(tx) = self.pending.lock().unwrap().take() {
			let _ = tx.send(result);
		}
	}

	pub(crate) fn abort(&self) {
		let _ = self.pending.lock().unwrap().take();
	}
}

pub fn companion_failure(rejection: Option<&str>) -> AppError {
	AppError::Auth(
		match rejection {
			Some(
				marker @ (COMPANION_UNAVAILABLE
				| COMPANION_UNTRUSTED
				| COMPANION_REFUSED
				| COMPANION_DISABLED),
			) => marker,
			Some(COMPANION_CANCELLED) => CANCELED,
			_ => COMPANION_FAILED,
		}
		.into(),
	)
}

pub fn new_nonce() -> String {
	let mut bytes = [0u8; 32];
	getrandom::fill(&mut bytes).expect("system randomness unavailable");
	base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn without_secrets(url: &Url) -> String {
	let mut url = url.clone();
	url.set_query(None);
	url.set_fragment(None);
	url.into()
}

#[cfg(target_os = "windows")]
const OAUTH_DATA_SUBDIR: &str = "oauth-webview";

/// `incognito` silently no-ops on WebView2 older than 101.0.1210.39.
#[cfg(target_os = "windows")]
pub fn oauth_data_dir(
	app: &tauri::AppHandle,
	nonce: &str,
) -> Result<std::path::PathBuf, AppError> {
	use tauri::Manager;

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

/// WebView2 locks the folder while the window lives, so sweep at next launch.
#[cfg(target_os = "windows")]
pub fn sweep_oauth_data_dirs(app: &tauri::AppHandle) {
	use tauri::Manager;

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

	struct TestProvider;

	impl OauthProvider for TestProvider {
		const NAME: &'static str = "Test";
	}

	fn bridge() -> OauthBridge<TestProvider> {
		OauthBridge::new()
	}

	fn auth_message(error: AppError) -> String {
		let AppError::Auth(message) = error else {
			panic!("a companion failure must be an auth error");
		};
		message
	}

	fn rust_function<'a>(source: &'a str, file: &str, name: &str) -> &'a str {
		let start = source
			.find(&format!("fn {name}("))
			.unwrap_or_else(|| panic!("{file} no longer defines {name}"));
		let length = source[start..]
			.find("\n}\n")
			.unwrap_or_else(|| panic!("{file} {name} has no closing brace"));
		&source[start..start + length]
	}

	#[test]
	fn companion_markers_match_the_android_plugin_and_the_frontend() {
		let plugin = include_str!(
			"../../gen/android/app/src/main/java/org/opengrind/googleoauth/GoogleOauthPlugin.kt"
		);
		let frontend = include_str!("../../../src/lib/api/sign-in.ts");
		for (verdict, kotlin, typescript, marker) in [
			(
				"Unavailable",
				"ERROR_UNAVAILABLE",
				"companionUnavailable",
				COMPANION_UNAVAILABLE,
			),
			(
				"Untrusted",
				"ERROR_UNTRUSTED",
				"companionUntrusted",
				COMPANION_UNTRUSTED,
			),
			(
				"Disabled",
				"ERROR_DISABLED",
				"companionDisabled",
				COMPANION_DISABLED,
			),
		] {
			assert!(
				plugin.contains(&format!("{kotlin} = \"{marker}\"")),
				"GoogleOauthPlugin.kt {kotlin} is not {marker}"
			);
			assert!(
				plugin.contains(&format!(
					"AddonGate.Verdict.{verdict} -> invoke.reject({kotlin})"
				)),
				"GoogleOauthPlugin.getToken no longer rejects {verdict} with {kotlin}"
			);
			assert!(
				frontend.contains(&format!("{typescript} = \"{marker}\"")),
				"sign-in.ts {typescript} is not {marker}"
			);
		}
		assert!(
			plugin
				.contains(&format!("ERROR_REFUSED = \"{COMPANION_REFUSED}\"")),
			"GoogleOauthPlugin.kt ERROR_REFUSED is not {COMPANION_REFUSED}"
		);
		assert!(
			frontend.contains(&format!(
				"companionRefused = \"{COMPANION_REFUSED}\""
			)),
			"sign-in.ts companionRefused is not {COMPANION_REFUSED}"
		);
		assert!(
			frontend
				.contains(&format!("companionFailed = \"{COMPANION_FAILED}\"")),
			"sign-in.ts companionFailed is not {COMPANION_FAILED}"
		);
		let squashed =
			|source: &str| source.split_whitespace().collect::<String>();
		assert!(
			squashed(plugin).contains(&squashed(
				"catch (e: SecurityException) { invoke.reject(ERROR_REFUSED) }"
			)),
			"GoogleOauthPlugin.kt no longer reports a companion that refuses this build as {COMPANION_REFUSED}"
		);
		assert!(
			plugin.contains("const val RESULT_REFUSED = Activity.RESULT_FIRST_USER"),
			"GoogleOauthPlugin.kt RESULT_REFUSED is no longer the result code the companion refuses a caller with"
		);
		assert!(
			squashed(plugin).contains(&squashed(
				"else if (result.resultCode == RESULT_REFUSED) { invoke.reject(ERROR_REFUSED) }"
			)),
			"GoogleOauthPlugin.tokenResult no longer reports the companion's refusal result as {COMPANION_REFUSED}"
		);
		assert!(
			plugin.contains(&format!(
				"ERROR_CANCELLED = \"{COMPANION_CANCELLED}\""
			)),
			"GoogleOauthPlugin.kt ERROR_CANCELLED is not {COMPANION_CANCELLED}"
		);
	}

	#[test]
	fn the_android_token_request_reports_failures_through_the_shared_mapping() {
		let file = "google_oauth/android.rs";
		let bridge = include_str!("google_oauth/android.rs");
		assert!(
			rust_function(bridge, file, "fetch_companion_token")
				.contains(".map_err(map_plugin_error)"),
			"{file} fetch_companion_token no longer maps plugin errors"
		);
		assert!(
			rust_function(bridge, file, "map_plugin_error")
				.contains("companion_failure("),
			"{file} map_plugin_error no longer goes through companion_failure"
		);
	}

	#[test]
	fn each_companion_refusal_reaches_the_frontend_as_its_marker() {
		for marker in [
			COMPANION_UNAVAILABLE,
			COMPANION_UNTRUSTED,
			COMPANION_REFUSED,
			COMPANION_DISABLED,
		] {
			assert_eq!(auth_message(companion_failure(Some(marker))), marker);
		}
	}

	#[test]
	fn a_cancelled_companion_request_stays_silent() {
		assert_eq!(
			auth_message(companion_failure(Some(COMPANION_CANCELLED))),
			CANCELED
		);
	}

	#[test]
	fn any_other_companion_failure_is_generic() {
		for rejection in [Some("no-token"), Some("companion-revoked"), None] {
			assert_eq!(
				auth_message(companion_failure(rejection)),
				COMPANION_FAILED
			);
		}
	}

	#[test]
	fn refuses_a_second_flow_while_one_is_pending() {
		let bridge = bridge();
		let _rx = bridge.begin().expect("first flow starts");
		assert!(bridge.begin().is_err());
	}

	#[test]
	fn the_refusal_names_the_provider() {
		let bridge = bridge();
		let _rx = bridge.begin().expect("first flow starts");
		let Err(AppError::Auth(message)) = bridge.begin() else {
			panic!("a second flow must be refused");
		};
		assert_eq!(message, "Test sign-in already in progress");
	}

	#[test]
	fn delivering_a_result_frees_the_slot_for_the_next_attempt() {
		let bridge = bridge();
		let _rx = bridge.begin().expect("first flow starts");
		bridge.fulfill(Ok("token".into()));
		assert!(bridge.begin().is_ok());
	}

	#[test]
	fn aborting_frees_the_slot_so_a_failed_setup_stays_retryable() {
		let bridge = bridge();
		let _rx = bridge.begin().expect("first flow starts");
		bridge.abort();
		assert!(
			bridge.begin().is_ok(),
			"a setup failure must not wedge sign-in for the whole session"
		);
	}

	#[test]
	fn a_logged_url_keeps_neither_the_query_nor_the_fragment() {
		let url = Url::parse(
			"https://web.grindr.com/path?token=secret#access_token=secret",
		)
		.unwrap();
		assert_eq!(without_secrets(&url), "https://web.grindr.com/path");
	}

	#[test]
	fn each_nonce_is_fresh_and_url_safe() {
		let (a, b) = (new_nonce(), new_nonce());
		assert_ne!(a, b);
		assert!(a
			.chars()
			.all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
	}
}
