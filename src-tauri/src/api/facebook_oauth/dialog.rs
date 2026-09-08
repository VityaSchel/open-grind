use tauri::Url;

use crate::api::oauth::CANCELED;
use crate::error::AppError;

const DIALOG_URL: &str = "https://www.facebook.com/v16.0/dialog/oauth";
const APP_ID: &str = "1273378622718674";
const SCOPE: &str = "public_profile,email";
const REDIRECT_URI: &str = "https://web.grindr.com/";
const REDIRECT_HOST: &str = "web.grindr.com";
const REDIRECT_PATH: &str = "/";

const ALLOWED_SCHEMES: [&str; 2] = ["https", "about"];

/// Matched verbatim by the frontend; Meta's own wording only reaches the log.
pub const DIALOG_ERROR: &str = "facebook-dialog-error";
pub const HANDOFF_REFUSED: &str = "facebook-handoff-refused";

pub fn dialog_url(state: &str) -> Result<Url, AppError> {
	Url::parse_with_params(
		DIALOG_URL,
		&[
			("client_id", APP_ID),
			("redirect_uri", REDIRECT_URI),
			("response_type", "token"),
			("scope", SCOPE),
			("display", "popup"),
			("state", state),
		],
	)
	.map_err(|e| AppError::Http(format!("invalid dialog URL: {e}")))
}

pub fn is_allowed_target(url: &Url) -> bool {
	ALLOWED_SCHEMES.contains(&url.scheme())
}

pub fn is_redirect_url(url: &Url) -> bool {
	url.host_str() == Some(REDIRECT_HOST) && url.path() == REDIRECT_PATH
}

fn decode_pairs(encoded: Option<&str>) -> Vec<(String, String)> {
	encoded
		.and_then(|s| Url::parse(&format!("x:/?{s}")).ok())
		.map(|parsed| {
			parsed
				.query_pairs()
				.map(|(k, v)| (k.into_owned(), v.into_owned()))
				.collect()
		})
		.unwrap_or_default()
}

pub fn result_from_redirect(
	url: &Url,
	state: &str,
) -> Option<Result<String, String>> {
	let mut fields = decode_pairs(url.query());
	fields.extend(decode_pairs(url.fragment()));
	let field = |name: &str| {
		fields
			.iter()
			.find(|(key, _)| key == name)
			.map(|(_, value)| value.clone())
	};

	if let Some(error) = field("error_description")
		.or_else(|| field("error_message"))
		.or_else(|| field("error"))
	{
		if field("error").as_deref() == Some("access_denied") {
			return Some(Err(CANCELED.to_owned()));
		}
		tracing::warn!("[fb-oauth] the dialog refused the sign-in: {error}");
		return Some(Err(DIALOG_ERROR.to_owned()));
	}

	let token = field("access_token")?;
	if field("state").as_deref() != Some(state) {
		return Some(Err("Sign-in could not be verified".to_owned()));
	}
	Some(Ok(token))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn url(s: &str) -> Url {
		Url::parse(s).unwrap()
	}

	fn param(built: &Url, name: &str) -> Option<String> {
		built
			.query_pairs()
			.find(|(key, _)| key == name)
			.map(|(_, value)| value.into_owned())
	}

	#[test]
	fn the_dialog_url_carries_the_app_id_and_the_registered_redirect() {
		let built = dialog_url("st4te").unwrap();
		assert_eq!(param(&built, "client_id").as_deref(), Some(APP_ID));
		assert_eq!(param(&built, "response_type").as_deref(), Some("token"));
		assert_eq!(param(&built, "state").as_deref(), Some("st4te"));
	}

	#[test]
	fn the_registered_redirect_keeps_its_trailing_slash() {
		assert_eq!(REDIRECT_URI, "https://web.grindr.com/");
		assert_eq!(
			param(&dialog_url("st4te").unwrap(), "redirect_uri").as_deref(),
			Some(REDIRECT_URI)
		);
	}

	#[test]
	fn a_token_in_the_fragment_is_accepted_when_the_state_matches() {
		let redirect = url(
			"https://web.grindr.com/#access_token=EAAtok&expires_in=6805&state=st4te",
		);
		assert_eq!(
			result_from_redirect(&redirect, "st4te"),
			Some(Ok("EAAtok".into()))
		);
	}

	#[test]
	fn a_mismatched_state_is_refused_even_with_a_token() {
		let redirect =
			url("https://web.grindr.com/#access_token=EAAtok&state=other");
		assert!(matches!(
			result_from_redirect(&redirect, "st4te"),
			Some(Err(_))
		));
	}

	#[test]
	fn a_missing_state_is_refused() {
		let redirect = url("https://web.grindr.com/#access_token=EAAtok");
		assert!(matches!(
			result_from_redirect(&redirect, "st4te"),
			Some(Err(_))
		));
	}

	#[test]
	fn a_denied_consent_reads_as_a_cancellation_not_a_failure() {
		let redirect = url(
			"https://web.grindr.com/?error=access_denied&error_description=Permissions+error",
		);
		assert_eq!(
			result_from_redirect(&redirect, "st4te"),
			Some(Err(CANCELED.into()))
		);
	}

	#[test]
	fn any_other_dialog_error_never_leaks_metas_wording() {
		let redirect = url(
			"https://web.grindr.com/?error=server_error&error_description=Try+again+later",
		);
		assert_eq!(
			result_from_redirect(&redirect, "st4te"),
			Some(Err(DIALOG_ERROR.into()))
		);
	}

	#[test]
	fn a_redirect_without_a_result_yet_is_not_a_verdict() {
		assert_eq!(
			result_from_redirect(&url("https://web.grindr.com/"), "s"),
			None
		);
	}

	#[test]
	fn the_facebook_dialog_itself_is_not_mistaken_for_the_redirect() {
		assert!(!is_redirect_url(&url(
			"https://www.facebook.com/v16.0/dialog/oauth?client_id=1"
		)));
		assert!(!is_redirect_url(&url("https://web.grindr.com/auth")));
		assert!(is_redirect_url(&url("https://web.grindr.com/")));
	}

	#[test]
	fn every_step_of_the_flow_is_allowed_to_load() {
		for allowed in [
			"https://www.facebook.com/v16.0/dialog/oauth",
			"https://m.facebook.com/login.php",
			"https://web.grindr.com/",
			"about:blank",
		] {
			assert!(is_allowed_target(&url(allowed)), "{allowed} must load");
		}
		for refused in [
			"file:///etc/passwd",
			"javascript:alert(1)",
			"intent://authorize/#Intent;package=com.facebook.katana;end",
			"fb1273378622718674://authorize/",
			"http://web.grindr.com/",
		] {
			assert!(
				!is_allowed_target(&url(refused)),
				"{refused} must not load"
			);
		}
	}
}
