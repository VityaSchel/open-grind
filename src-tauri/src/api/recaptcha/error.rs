use std::fmt;

use serde::Serialize;

use crate::error::AppError;
use crate::plugin_rejection::error_name;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "reason", content = "detail")]
pub enum RecaptchaError {
	UnsupportedPlatform,
	AddonUnavailable,
	AddonDisabled,
	AddonUntrusted,
	Cancelled,
	NoToken,
	UntrustedCaller,
	UnsupportedAction,
	GrindrMissing,
	MintFailed(Option<String>),
	MalformedToken,
	Failed,
}

impl RecaptchaError {
	pub fn from_rejection(marker: Option<&str>, detail: Option<&str>) -> Self {
		match marker {
			Some("recaptcha-unavailable") => Self::AddonUnavailable,
			Some("recaptcha-disabled") => Self::AddonDisabled,
			Some("recaptcha-untrusted") => Self::AddonUntrusted,
			Some("cancelled") => Self::Cancelled,
			Some("no-token") => Self::NoToken,
			Some("untrusted-caller") => Self::UntrustedCaller,
			Some("unsupported-action") => Self::UnsupportedAction,
			Some("grindr-missing") => Self::GrindrMissing,
			Some("mint-failed") => Self::MintFailed(error_name(detail)),
			_ => Self::Failed,
		}
	}
}

impl fmt::Display for RecaptchaError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::MintFailed(Some(code)) => write!(f, "mint failed ({code})"),
			other => fmt::Debug::fmt(other, f),
		}
	}
}

impl std::error::Error for RecaptchaError {}

impl From<RecaptchaError> for AppError {
	fn from(error: RecaptchaError) -> Self {
		AppError::Recaptcha(error)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn every_marker_the_plugin_or_the_addon_sends_has_its_own_reason() {
		for (marker, expected) in [
			("recaptcha-unavailable", RecaptchaError::AddonUnavailable),
			("recaptcha-disabled", RecaptchaError::AddonDisabled),
			("recaptcha-untrusted", RecaptchaError::AddonUntrusted),
			("cancelled", RecaptchaError::Cancelled),
			("no-token", RecaptchaError::NoToken),
			("untrusted-caller", RecaptchaError::UntrustedCaller),
			("unsupported-action", RecaptchaError::UnsupportedAction),
			("grindr-missing", RecaptchaError::GrindrMissing),
			("mint-failed", RecaptchaError::MintFailed(None)),
		] {
			assert_eq!(
				RecaptchaError::from_rejection(Some(marker), None),
				expected
			);
		}
	}

	#[test]
	fn an_unknown_or_missing_marker_is_a_generic_failure() {
		for marker in [
			Some("companion-unavailable"),
			Some(""),
			Some("MINT-FAILED"),
			None,
		] {
			assert_eq!(
				RecaptchaError::from_rejection(marker, Some("NETWORK_ERROR")),
				RecaptchaError::Failed
			);
		}
	}

	#[test]
	fn a_mint_failure_keeps_the_sdk_error_name() {
		for name in ["NETWORK_ERROR", "IllegalStateException", "INTERNAL_ERROR"]
		{
			assert_eq!(
				RecaptchaError::from_rejection(Some("mint-failed"), Some(name)),
				RecaptchaError::MintFailed(Some(name.to_owned()))
			);
		}
	}

	#[test]
	fn a_mint_failure_detail_that_is_not_an_error_name_is_dropped() {
		assert_eq!(
			RecaptchaError::from_rejection(
				Some("mint-failed"),
				Some("0cAFcWeA-token.part")
			),
			RecaptchaError::MintFailed(None)
		);
	}

	#[test]
	fn the_detail_only_travels_with_a_mint_failure() {
		assert_eq!(
			RecaptchaError::from_rejection(
				Some("grindr-missing"),
				Some("NETWORK_ERROR")
			),
			RecaptchaError::GrindrMissing
		);
	}

	#[test]
	fn a_failure_reaches_the_frontend_as_a_recaptcha_error_with_its_reason() {
		let app = AppError::from(RecaptchaError::MintFailed(Some(
			"NETWORK_ERROR".into(),
		)));
		let json = serde_json::to_value(&app).unwrap();
		assert_eq!(json["kind"], "Recaptcha");
		assert_eq!(json["message"]["reason"], "mintFailed");
		assert_eq!(json["message"]["detail"], "NETWORK_ERROR");

		let json =
			serde_json::to_value(AppError::from(RecaptchaError::GrindrMissing))
				.unwrap();
		assert_eq!(json["message"]["reason"], "grindrMissing");
	}
}
