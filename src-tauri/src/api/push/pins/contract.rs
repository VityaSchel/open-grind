use std::collections::BTreeSet;

use super::{BRIDGE, CONTRACT, FCM_REQUEST, PLUGIN};
use crate::api::push::PushError;
use crate::pin_support::{
	addon_gate_verdicts, assert_rejections_classify_as, kotlin_constant,
	kotlin_package, spaced_match, squashed, MANIFEST,
};

const CONTRACT_FILE: &str = "PushContract.kt";

fn kotlin_integer(source: &str, file: &str, name: &str) -> i64 {
	let start = spaced_match(source, &format!("const val {name} ="))
		.unwrap_or_else(|| panic!("{file} no longer declares {name}"))
		.end;
	let literal: String = source[start..]
		.trim_start()
		.chars()
		.take_while(char::is_ascii_digit)
		.collect();
	literal
		.parse()
		.unwrap_or_else(|_| panic!("{file} {name} is not an integer literal"))
}

fn fcm_markers() -> BTreeSet<&'static str> {
	CONTRACT
		.lines()
		.filter_map(|line| {
			let (name, value) =
				line.trim().strip_prefix("const val ")?.split_once('=')?;
			value.trim().starts_with("\"fcm-").then_some(name.trim())
		})
		.collect()
}

#[test]
fn the_fcm_push_bridge_matches_the_addon_contract() {
	assert!(
		MANIFEST.contains(
			"<uses-permission android:name=\"android.permission.POST_NOTIFICATIONS\" />"
		),
		"without POST_NOTIFICATIONS every push notification is dropped on Android 13 and newer"
	);

	for (constant, published) in [
		("ADDON_PACKAGE", "org.opengrind.fcm"),
		("ACTION_BIND", "org.opengrind.fcm.action.BIND"),
		("EXTRA_NONCE", "org.opengrind.fcm.extra.NONCE"),
		("ACTION_MESSAGE", "org.opengrind.fcm.action.MESSAGE"),
		("ACTION_NEW_TOKEN", "org.opengrind.fcm.action.NEW_TOKEN"),
		("EXTRA_DATA", "org.opengrind.fcm.extra.DATA"),
		("EXTRA_SENT_TIME", "org.opengrind.fcm.extra.SENT_TIME"),
		("EXTRA_TOKEN", "org.opengrind.fcm.extra.TOKEN"),
		("EXTRA_ERROR", "org.opengrind.fcm.extra.ERROR"),
		("EXTRA_ERROR_DETAIL", "org.opengrind.fcm.extra.ERROR_DETAIL"),
	] {
		assert_eq!(
			kotlin_constant(CONTRACT, CONTRACT_FILE, constant),
			published,
			"{CONTRACT_FILE} {constant} drifted from the add-on's published contract"
		);
	}

	for constant in ["ACTION_MESSAGE", "ACTION_NEW_TOKEN"] {
		let action = kotlin_constant(CONTRACT, CONTRACT_FILE, constant);
		assert!(
			MANIFEST.contains(&format!("<action android:name=\"{action}\" />")),
			"PushReceiver has no intent filter for {action}, so the add-on's broadcast is dropped"
		);
	}

	let package = kotlin_package(PLUGIN, "PushPlugin.kt");
	assert!(
		squashed(BRIDGE).contains(&format!(
			"register_android_plugin(\"{package}\",\"PushPlugin\""
		)) && spaced_match(PLUGIN, "class PushPlugin(").is_some(),
		"push/android.rs registers a plugin class that PushPlugin.kt does not declare"
	);
}

#[test]
fn the_messenger_codes_match_the_addon_contract() {
	for (constant, code) in [
		("MSG_GET_TOKEN", 1),
		("MSG_DELETE_TOKEN", 2),
		("MSG_TOKEN", 101),
		("MSG_DELETED", 102),
		("MSG_ERROR", 103),
	] {
		assert_eq!(
			kotlin_integer(CONTRACT, CONTRACT_FILE, constant),
			code,
			"{CONTRACT_FILE} {constant} drifted from the add-on's Messenger contract; the add-on's FcmContractTest pins the same numbers"
		);
	}
}

#[test]
fn every_fcm_rejection_classifies_to_its_reason() {
	let plugin = squashed(PLUGIN);
	for verdict in addon_gate_verdicts()
		.into_iter()
		.filter(|verdict| *verdict != "Launch")
	{
		let constant = match verdict {
			"Unavailable" => "ERROR_UNAVAILABLE",
			"Disabled" => "ERROR_DISABLED",
			"Untrusted" => "ERROR_UNTRUSTED",
			unknown => {
				panic!("AddonGate.Verdict.{unknown} has no FCM add-on reason")
			}
		};
		assert!(
			plugin.contains(&format!(
				"AddonGate.Verdict.{verdict}->invoke.reject(PushContract.{constant})"
			)),
			"PushPlugin.kt no longer rejects {verdict} with {constant}"
		);
	}

	let request = squashed(FCM_REQUEST);
	for constant in ["ERROR_REFUSED", "ERROR_TIMED_OUT"] {
		assert!(
			request.contains(&format!(
				"FcmOutcome.Failed(PushContract.{constant},"
			)),
			"FcmRequest.kt never fails with {constant}"
		);
	}
	assert!(
		plugin.contains(
			"isFcmOutcome.Failed->invoke.reject(outcome.marker,outcome.detail)"
		),
		"PushPlugin.kt no longer passes the add-on's error and its detail through"
	);

	let reasons = [
		("ERROR_UNAVAILABLE", PushError::AddonUnavailable),
		("ERROR_DISABLED", PushError::AddonDisabled),
		("ERROR_UNTRUSTED", PushError::AddonUntrusted),
		("ERROR_REFUSED", PushError::AddonRefused),
		("ERROR_TIMED_OUT", PushError::TimedOut),
	];
	assert_eq!(
		fcm_markers(),
		reasons.iter().map(|(constant, _)| *constant).collect(),
		"{CONTRACT_FILE} declares an fcm-* marker this pin does not classify"
	);
	for (constant, expected) in reasons {
		let marker = kotlin_constant(CONTRACT, CONTRACT_FILE, constant);
		let classified = PushError::from_rejection(Some(marker), None);
		assert_ne!(
			classified,
			PushError::Failed,
			"{CONTRACT_FILE} {constant} = {marker} falls through to a generic failure"
		);
		assert_eq!(
			classified, expected,
			"{CONTRACT_FILE} {constant} = {marker} is not classified as {expected:?}"
		);
	}

	assert_rejections_classify_as("push/android.rs", BRIDGE, "PushError");
}
