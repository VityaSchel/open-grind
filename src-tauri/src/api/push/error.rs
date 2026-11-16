use std::fmt;

use serde::Serialize;

use crate::error::AppError;
use crate::plugin_rejection::error_name;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "reason", content = "detail")]
pub enum PushError {
	UnsupportedPlatform,
	AddonUnavailable,
	AddonDisabled,
	AddonUntrusted,
	AddonRefused,
	AddonOutdated,
	AddonHidden,
	AddonTurnedOff,
	AddonBlocked,
	UntrustedCaller,
	TimedOut,
	FirebaseUnavailable,
	TokenFailed(Option<String>),
	DeleteFailed(Option<String>),
	MalformedToken,
	FastUnconfigured,
	RelayNoDistributor,
	RelayDistributorUnavailable,
	RelayActionRequired,
	RelayVapidRequired,
	RelayNetwork,
	RelayRegistrationFailed,
	RelayTimedOut,
	RelayCancelled,
	RelaySetupLost,
	RelayNoSetup,
	RelayUnpaired,
	RelayRegisterFailed(Option<String>),
	RelayAccountChanged,
	RelaySaveFailed(Option<String>),
	RelayShareFailed(Option<String>),
	Failed,
}

impl PushError {
	pub fn from_rejection(marker: Option<&str>, detail: Option<&str>) -> Self {
		match marker {
			Some("fcm-unavailable") => Self::AddonUnavailable,
			Some("fcm-disabled") => Self::AddonDisabled,
			Some("fcm-untrusted") => Self::AddonUntrusted,
			Some("fcm-refused") => Self::AddonRefused,
			Some("fcm-outdated") => Self::AddonOutdated,
			Some("fcm-hidden") => Self::AddonHidden,
			Some("fcm-turned-off") => Self::AddonTurnedOff,
			Some("fcm-blocked") => Self::AddonBlocked,
			Some("untrusted-caller") => Self::UntrustedCaller,
			Some("fcm-timed-out") => Self::TimedOut,
			Some("firebase-unavailable") => Self::FirebaseUnavailable,
			Some("token-failed") => Self::TokenFailed(error_name(detail)),
			Some("delete-failed") => Self::DeleteFailed(error_name(detail)),
			Some("fast-unconfigured") => Self::FastUnconfigured,
			Some("relay-no-distributor") => Self::RelayNoDistributor,
			Some("relay-distributor-unavailable") => {
				Self::RelayDistributorUnavailable
			}
			Some("relay-action-required") => Self::RelayActionRequired,
			Some("relay-vapid-required") => Self::RelayVapidRequired,
			Some("relay-network") => Self::RelayNetwork,
			Some("relay-registration-failed") => Self::RelayRegistrationFailed,
			Some("relay-timed-out") => Self::RelayTimedOut,
			Some("relay-cancelled") => Self::RelayCancelled,
			Some("relay-setup-lost") => Self::RelaySetupLost,
			Some("relay-no-setup") => Self::RelayNoSetup,
			Some("relay-unpaired") => Self::RelayUnpaired,
			Some("relay-register-failed") => {
				Self::RelayRegisterFailed(error_name(detail))
			}
			Some("relay-account-changed") => Self::RelayAccountChanged,
			Some("relay-save-failed") => {
				Self::RelaySaveFailed(error_name(detail))
			}
			Some("relay-share-failed") => {
				Self::RelayShareFailed(error_name(detail))
			}
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

impl fmt::Display for PushError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::TokenFailed(Some(code)) => write!(f, "token failed ({code})"),
			Self::DeleteFailed(Some(code)) => {
				write!(f, "delete failed ({code})")
			}
			Self::RelayRegisterFailed(Some(code)) => {
				write!(f, "relay register failed ({code})")
			}
			Self::RelaySaveFailed(Some(code)) => {
				write!(f, "relay save failed ({code})")
			}
			Self::RelayShareFailed(Some(code)) => {
				write!(f, "relay share failed ({code})")
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
			("fcm-outdated", PushError::AddonOutdated),
			("fcm-hidden", PushError::AddonHidden),
			("fcm-turned-off", PushError::AddonTurnedOff),
			("fcm-blocked", PushError::AddonBlocked),
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
	fn every_marker_the_fast_mode_setup_sends_has_its_own_reason() {
		for (marker, expected) in [
			("fast-unconfigured", PushError::FastUnconfigured),
			("relay-no-distributor", PushError::RelayNoDistributor),
			(
				"relay-distributor-unavailable",
				PushError::RelayDistributorUnavailable,
			),
			("relay-action-required", PushError::RelayActionRequired),
			("relay-vapid-required", PushError::RelayVapidRequired),
			("relay-network", PushError::RelayNetwork),
			(
				"relay-registration-failed",
				PushError::RelayRegistrationFailed,
			),
			("relay-timed-out", PushError::RelayTimedOut),
			("relay-cancelled", PushError::RelayCancelled),
			("relay-setup-lost", PushError::RelaySetupLost),
			("relay-no-setup", PushError::RelayNoSetup),
			("relay-unpaired", PushError::RelayUnpaired),
			(
				"relay-register-failed",
				PushError::RelayRegisterFailed(None),
			),
			("relay-account-changed", PushError::RelayAccountChanged),
			("relay-save-failed", PushError::RelaySaveFailed(None)),
			("relay-share-failed", PushError::RelayShareFailed(None)),
		] {
			assert_eq!(PushError::from_rejection(Some(marker), None), expected);
		}
	}

	#[test]
	fn a_relay_register_save_or_share_failure_keeps_the_exception_name() {
		for (marker, expected) in [
			(
				"relay-register-failed",
				PushError::RelayRegisterFailed(Some("IOException".to_owned())),
			),
			(
				"relay-save-failed",
				PushError::RelaySaveFailed(Some("IOException".to_owned())),
			),
			(
				"relay-share-failed",
				PushError::RelayShareFailed(Some("IOException".to_owned())),
			),
		] {
			assert_eq!(
				PushError::from_rejection(Some(marker), Some("IOException")),
				expected
			);
		}
		assert_eq!(
			PushError::from_rejection(
				Some("relay-save-failed"),
				Some("content://x")
			),
			PushError::RelaySaveFailed(None)
		);
		assert_eq!(
			PushError::from_rejection(
				Some("relay-cancelled"),
				Some("IOException")
			),
			PushError::RelayCancelled
		);
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
	fn a_token_or_delete_failure_keeps_the_firebase_exception_name() {
		assert_eq!(
			PushError::from_rejection(
				Some("token-failed"),
				Some("IOException")
			),
			PushError::TokenFailed(Some("IOException".to_owned()))
		);
		assert_eq!(
			PushError::from_rejection(
				Some("delete-failed"),
				Some("IOException")
			),
			PushError::DeleteFailed(Some("IOException".to_owned()))
		);
		assert_eq!(
			PushError::from_rejection(Some("token-failed"), Some("has space")),
			PushError::TokenFailed(None)
		);
	}

	#[test]
	fn the_detail_only_travels_with_a_token_or_delete_failure() {
		assert_eq!(
			PushError::from_rejection(Some("fcm-refused"), Some("IOException")),
			PushError::AddonRefused
		);
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
			PushError::AddonOutdated,
			PushError::AddonHidden,
			PushError::AddonTurnedOff,
			PushError::AddonBlocked,
			PushError::UntrustedCaller,
			PushError::MalformedToken,
			PushError::FastUnconfigured,
			PushError::RelayNoDistributor,
			PushError::RelayDistributorUnavailable,
			PushError::RelayActionRequired,
			PushError::RelayVapidRequired,
			PushError::RelayNetwork,
			PushError::RelayRegistrationFailed,
			PushError::RelayTimedOut,
			PushError::RelayCancelled,
			PushError::RelaySetupLost,
			PushError::RelayNoSetup,
			PushError::RelayUnpaired,
			PushError::RelayRegisterFailed(None),
			PushError::RelayAccountChanged,
			PushError::RelaySaveFailed(None),
			PushError::RelayShareFailed(None),
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

	#[test]
	fn a_relay_failure_reaches_the_frontend_with_its_camel_case_reason() {
		for (error, reason) in [
			(PushError::FastUnconfigured, "fastUnconfigured"),
			(
				PushError::RelayDistributorUnavailable,
				"relayDistributorUnavailable",
			),
			(PushError::RelaySetupLost, "relaySetupLost"),
			(PushError::RelayAccountChanged, "relayAccountChanged"),
			(PushError::RelayRegisterFailed(None), "relayRegisterFailed"),
		] {
			let json = serde_json::to_value(AppError::from(error)).unwrap();
			assert_eq!(json["kind"], "Push");
			assert_eq!(json["message"]["reason"], reason);
		}
	}
}
