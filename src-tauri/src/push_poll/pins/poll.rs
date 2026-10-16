use std::collections::BTreeSet;

use serde_json::Value;

use super::{
	ANDROID_STRINGS, ANNOUNCE, LINES, PAYLOAD, POLL, POLL_SERVICE, PUSH_TEXT,
	PUSH_WORDS, SCHEDULE, STRINGS,
};
use crate::pin_support::{braced_block, camel_case, kotlin_constant, squashed};
use crate::push_poll::pushes::{
	Poll, ShownConversation, BODY_KEYS, CHATS_CHANNEL, CLEAR_DEEPLINK,
	CONVERSATION_DEEPLINK, GENERIC_BODY, MESSAGE_LINES, UNSEND_DEEPLINK,
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
			strings.contains(&format!("\"{key}\"toPushText.")),
			"PushStrings.kt has no PushText for {key}, so the poll's notification shows the generic body instead"
		);
	}
	assert!(
		strings.contains("returnwords(texts[value]?:fallback)"),
		"PushStrings.resolve no longer falls back for an unknown key, so {GENERIC_BODY} would be dropped"
	);
	assert!(
		strings.contains("PushKind.Message->PushText.Message"),
		"PushStrings.defaultBody no longer words a message with PushText.Message, which is how {GENERIC_BODY} is shown"
	);
	assert!(
		squashed(PAYLOAD).contains(
			"PushStrings.resolve(value=data[\"body\"],translate=data[\"translateBody\"],fallback=PushStrings.defaultBody(kind),words=words,)"
		),
		"PushPayload no longer words an untranslated body with the default for its kind, which is how {GENERIC_BODY} is shown"
	);
}

fn lower_first(name: &str) -> String {
	let mut characters = name.chars();
	characters.next().map_or_else(String::new, |first| {
		first.to_lowercase().chain(characters).collect()
	})
}

#[test]
fn every_push_text_reads_the_message_desktop_notifications_show() {
	let texts: BTreeSet<&str> =
		braced_block(PUSH_TEXT, "PushText.kt", "enum class PushText")
			.split(',')
			.map(str::trim)
			.filter(|text| !text.is_empty())
			.collect();
	let words =
		squashed(braced_block(PUSH_WORDS, "PushWords.kt", "fun resourceOf("));
	let arms: Vec<(&str, &str)> = words
		.split("PushText.")
		.skip(1)
		.filter_map(|arm| arm.split_once("->R.string."))
		.collect();
	assert_eq!(
		arms.iter().map(|(text, _)| *text).collect::<BTreeSet<_>>(),
		texts,
		"PushWords.resourceOf was not parsed, or it no longer words every PushText"
	);
	let manifest: Value = serde_json::from_str(ANDROID_STRINGS)
		.expect("android-strings.json is not JSON");
	for (text, resource) in arms {
		let (prefix, key) = match text {
			"Someone" => ("push_", "common.someone".to_owned()),
			"Tap" => ("push_body_", "interest.taps.notification".to_owned()),
			_ => (
				"push_body_",
				format!("chat.notification.{}", lower_first(text)),
			),
		};
		assert_eq!(
			resource.strip_prefix(prefix).map(camel_case),
			Some(lower_first(text)),
			"PushWords.kt words PushText.{text} with R.string.{resource}, not with {prefix} and its own name"
		);
		assert_eq!(
			manifest.get(resource).and_then(Value::as_str),
			Some(key.as_str()),
			"android-strings.json must map {resource} to {key}"
		);
		assert!(
			ANNOUNCE.contains(&format!("\"{key}\"")),
			"desktop notifications no longer show {key}, so PushText.{text} reads differently on Android"
		);
	}
}

#[test]
fn every_link_and_channel_the_poll_emits_is_one_kotlin_routes() {
	let payload = squashed(PAYLOAD);
	for (rust, kotlin, parameter) in [
		(CONVERSATION_DEEPLINK, "CONVERSATION_DEEPLINK", "id"),
		(CLEAR_DEEPLINK, "CLEAR_DEEPLINK", "conversationId"),
		(UNSEND_DEEPLINK, "UNSEND_DEEPLINK", "notificationId"),
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
	assert_eq!(
		CHATS_CHANNEL,
		payload_constant("CHATS_CHANNEL"),
		"the poll's CHATS_CHANNEL is not the one PushPayload.kt routes"
	);
}

#[test]
fn the_cards_kotlin_reports_reach_the_poll_under_the_names_it_reads() {
	let encode = braced_block(POLL, "PushPoll.kt", "private fun encode(");
	let names: Vec<&str> = encode
		.split(".put(\"")
		.skip(1)
		.filter_map(|call| call.split('"').next())
		.collect();
	assert_eq!(
		names,
		["conversationId", "keys"],
		"PushPoll.kt encodes the shown cards under different names"
	);
	assert!(
		squashed(encode).contains(".put(\"keys\",JSONArray("),
		"PushPoll.kt no longer sends the keys as a JSON array, so the poll could not read any card"
	);
	let shown: ShownConversation = serde_json::from_value(serde_json::json!({
		names[0]: "111:222",
		names[1]: ["poll:111:222:2000:c0ffee"],
	}))
	.expect("the poll reads the cards Kotlin encodes");
	assert_eq!(
		shown.message_ids(),
		["2000:c0ffee"],
		"a card Kotlin reports would never be checked for unsent messages"
	);
}

#[test]
fn a_check_fetches_no_more_messages_than_a_card_shows() {
	assert!(
		squashed(LINES).contains(&format!("constvalLIMIT={MESSAGE_LINES}")),
		"ConversationLines.LIMIT no longer equals MESSAGE_LINES, so a check fetches lines the card drops or shows fewer than it could"
	);
}
