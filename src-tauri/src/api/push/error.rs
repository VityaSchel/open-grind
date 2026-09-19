use std::fmt;

use serde::Serialize;

use crate::error::AppError;

const MAX_DETAIL_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "reason", content = "detail")]
pub enum PushError {
	UnsupportedPlatform,
	AddonUnavailable,
	AddonDisabled,
	AddonUntrusted,
	AddonRefused,
	UntrustedCaller,
	TimedOut,
	FirebaseUnavailable,
	TokenFailed(Option<String>),
	DeleteFailed(Option<String>),
	MalformedToken,
	Failed,
}

impl PushError {
	pub fn from_rejection(marker: Option<&str>, detail: Option<&str>) -> Self {
		let name = || detail.filter(|d| is_error_name(d)).map(str::to_owned);
		match marker {
			Some("fcm-unavailable") => Self::AddonUnavailable,
			Some("fcm-disabled") => Self::AddonDisabled,
			Some("fcm-untrusted") => Self::AddonUntrusted,
			Some("fcm-refused") => Self::AddonRefused,
			Some("untrusted-caller") => Self::UntrustedCaller,
			Some("fcm-timed-out") => Self::TimedOut,
			Some("firebase-unavailable") => Self::FirebaseUnavailable,
			Some("token-failed") => Self::TokenFailed(name()),
			Some("delete-failed") => Self::DeleteFailed(name()),
			_ => Self::Failed,
		}
	}

	pub fn is_transient(&self) -> bool {
		matches!(
			self,
			Self::TimedOut | Self::TokenFailed(_) | Self::FirebaseUnavailable
		)
	}
}

fn is_error_name(detail: &str) -> bool {
	(1..=MAX_DETAIL_CHARS).contains(&detail.len())
		&& detail
			.bytes()
			.all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

impl fmt::Display for PushError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::TokenFailed(Some(code)) => write!(f, "token failed ({code})"),
			Self::DeleteFailed(Some(code)) => {
				write!(f, "delete failed ({code})")
			}
			other => fmt::Debug::fmt(other, f),
		}
	}
}

impl std::error::Error for PushError {}

impl From<PushError> for AppError {
	fn from(error: PushError) -> Self {
		AppError::Push(error)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn every_marker_the_plugin_or_the_addon_sends_has_its_own_reason() {
		for (marker, expected) in [
			("fcm-unavailable", PushError::AddonUnavailable),
			("fcm-disabled", PushError::AddonDisabled),
			("fcm-untrusted", PushError::AddonUntrusted),
			("fcm-refused", PushError::AddonRefused),
			("untrusted-caller", PushError::UntrustedCaller),
			("fcm-timed-out", PushError::TimedOut),
			("firebase-unavailable", PushError::FirebaseUnavailable),
			("token-failed", PushError::TokenFailed(None)),
			("delete-failed", PushError::DeleteFailed(None)),
		] {
			assert_eq!(PushError::from_rejection(Some(marker), None), expected);
		}
	}

	#[test]
	fn an_unknown_or_missing_marker_is_a_generic_failure() {
		for marker in [Some("recaptcha-unavailable"), Some(""), None] {
			assert_eq!(
				PushError::from_rejection(marker, Some("IOException")),
				PushError::Failed
			);
		}
	}

	#[test]
	fn a_token_failure_keeps_the_firebase_exception_name() {
		assert_eq!(
			PushError::from_rejection(
				Some("token-failed"),
				Some("IOException")
			),
			PushError::TokenFailed(Some("IOException".to_owned()))
		);
	}

	#[test]
	fn a_detail_that_is_not_an_exception_name_is_dropped() {
		let too_long = "A".repeat(MAX_DETAIL_CHARS + 1);
		for detail in ["", "has space", "a:b", too_long.as_str()] {
			assert_eq!(
				PushError::from_rejection(Some("token-failed"), Some(detail)),
				PushError::TokenFailed(None)
			);
		}
	}

	#[test]
	fn a_cold_start_failure_is_worth_retrying_but_a_refusal_is_not() {
		assert!(PushError::TokenFailed(None).is_transient());
		assert!(PushError::TimedOut.is_transient());
		assert!(PushError::FirebaseUnavailable.is_transient());
		for permanent in [
			PushError::AddonUnavailable,
			PushError::AddonDisabled,
			PushError::AddonUntrusted,
			PushError::AddonRefused,
			PushError::UntrustedCaller,
			PushError::MalformedToken,
			PushError::Failed,
		] {
			assert!(!permanent.is_transient(), "{permanent:?}");
		}
	}

	#[test]
	fn a_failure_reaches_the_frontend_as_a_push_error_with_its_reason() {
		let json = serde_json::to_value(AppError::from(
			PushError::TokenFailed(Some("IOException".into())),
		))
		.unwrap();
		assert_eq!(json["kind"], "Push");
		assert_eq!(json["message"]["reason"], "tokenFailed");
		assert_eq!(json["message"]["detail"], "IOException");
	}
}
