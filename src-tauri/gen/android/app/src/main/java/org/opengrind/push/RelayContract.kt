package org.opengrind.push

object RelayContract {
	const val ERROR_FAST_UNCONFIGURED = "fast-unconfigured"
	const val ERROR_NO_DISTRIBUTOR = "relay-no-distributor"
	const val ERROR_DISTRIBUTOR_UNAVAILABLE = "relay-distributor-unavailable"
	const val ERROR_ACTION_REQUIRED = "relay-action-required"
	const val ERROR_VAPID_REQUIRED = "relay-vapid-required"
	const val ERROR_NETWORK = "relay-network"
	const val ERROR_REGISTRATION_FAILED = "relay-registration-failed"
	const val ERROR_TIMED_OUT = "relay-timed-out"
	const val ERROR_CANCELLED = "relay-cancelled"
	const val ERROR_SETUP_LOST = "relay-setup-lost"
	const val ERROR_NO_SETUP = "relay-no-setup"
	const val ERROR_UNPAIRED = "relay-unpaired"
	const val ERROR_REGISTER_FAILED = "relay-register-failed"
	const val ERROR_ACCOUNT_CHANGED = "relay-account-changed"
	const val ERROR_SAVE_FAILED = "relay-save-failed"
	const val ERROR_SHARE_FAILED = "relay-share-failed"
}
