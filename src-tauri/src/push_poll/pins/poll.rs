use std::collections::BTreeSet;

use serde_json::Value;

use super::{PAYLOAD, POLL, POLL_SERVICE, SCHEDULE, STRINGS};
use crate::pin_support::{braced_block, kotlin_constant, squashed};
use crate::push_poll::pushes::{
	Poll, BODY_KEYS, CHATS_CHANNEL, CLEAR_DEEPLINK, CONVERSATION_DEEPLINK,
	GENERIC_BODY, TAPS_CHANNEL, TAPS_DEEPLINK,
};

fn payload_constant(name: &str) -> &'static str {
	kotlin_constant(PAYLOAD, "PushPayload.kt", name)
}

#[test]
fn kotlin_reads_every_key_of_the_poll_envelope_and_nothing_else() {
	let envelope =
		serde_json::to_value(Poll::default()).expect("a Poll serializes");
	let envelope = envelope.as_object().expect("a Poll is a JSON object");
	let poll = squashed(POLL);
	let read: BTreeSet<&str> = poll
		.split("root.get")
		.skip(1)
		.filter_map(|call| call.split_once("(\"")?.1.split('"').next())
		.collect();
	assert_eq!(
		read,
		envelope.keys().map(String::as_str).collect(),
		"PushPoll.kt and the Rust Poll disagree on the envelope keys, so every poll would decode to nothing"
	);
	for (key, value) in envelope {
		let getter = match value {
			Value::Number(_) => "getLong",
			Value::Array(_) => "getJSONArray",
			other => panic!("the Poll envelope key {key} holds {other}, which PushPoll.kt has no reader for"),
		};
		assert!(
			poll.contains(&format!("root.{getter}(\"{key}\")")),
			"PushPoll.kt no longer reads {key} with {getter}"
		);
	}
}

#[test]
fn the_background_poll_never_runs_while_notifications_are_off() {
	let schedule = squashed(SCHEDULE);
	assert!(
		schedule.contains(
			"funpolls(context:Context,mode:PushMode=PushSettings.mode(context)):Boolean=mode==PushMode.Slow&&PushSettings.notificationsEnabled(context)"
		),
		"PushSchedule.polls no longer requires slow mode and the master switch"
	);
	assert!(
		braced_block(SCHEDULE, "PushSchedule.kt", "if (!polls(context, mode))")
			.contains("scheduler.cancel(JOB_ID)"),
		"PushSchedule.follow would leave the poll job armed with notifications off"
	);
	assert!(
		squashed(POLL_SERVICE).contains("if(!PushSchedule.polls(this))returnfalse"),
		"a persisted poll job would sweep after a reboot with notifications off"
	);
}

#[test]
fn every_body_the_poll_emits_is_one_kotlin_can_word() {
	let strings = squashed(STRINGS);
	for key in BODY_KEYS.into_iter().filter(|key| *key != GENERIC_BODY) {
		assert!(
			strings.contains(&format!("\"{key}\"to\"")),
			"PushStrings.kt has no wording for {key}, so the poll's notification shows the generic body instead"
		);
	}
	assert!(
		strings.contains("returntranslations[value]?:fallback"),
		"PushStrings.resolve no longer falls back for an unknown key, so {GENERIC_BODY} would be dropped"
	);
	assert!(
		squashed(PAYLOAD).contains(
			"PushStrings.resolve(data[\"body\"],data[\"translateBody\"],PushStrings.defaultBody(kind),)"
		),
		"PushPayload no longer words an untranslated body with the default for its kind, which is how {GENERIC_BODY} is shown"
	);
}

#[test]
fn every_link_and_channel_the_poll_emits_is_one_kotlin_routes() {
	let payload = squashed(PAYLOAD);
	for (rust, kotlin, parameter) in [
		(CONVERSATION_DEEPLINK, "CONVERSATION_DEEPLINK", "id"),
		(CLEAR_DEEPLINK, "CLEAR_DEEPLINK", "conversationId"),
	] {
		assert_eq!(
			rust,
			format!("{}?{parameter}=", payload_constant(kotlin)),
			"the poll's {kotlin} is not the link PushPayload.kt routes"
		);
		assert!(
			payload
				.contains(&format!("queryParameter(action,\"{parameter}\")")),
			"PushPayload.kt no longer reads {parameter} from the {kotlin} link"
		);
	}
	for (rust, kotlin) in [
		(TAPS_DEEPLINK, "TAPS_DEEPLINK"),
		(CHATS_CHANNEL, "CHATS_CHANNEL"),
		(TAPS_CHANNEL, "TAPS_CHANNEL"),
	] {
		assert_eq!(
			rust,
			payload_constant(kotlin),
			"the poll's {kotlin} is not the one PushPayload.kt routes"
		);
	}
}
