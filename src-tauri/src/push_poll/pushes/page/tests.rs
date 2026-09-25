use serde_json::{json, Value};

use crate::push_poll::pushes::tests::{conversation_entry, inbox, ME, SINCE};
use crate::push_poll::pushes::{
	pages_wanted, poll, Answer, Pages, Poll, GENERIC_BODY, MESSAGE_LINES,
	MESSAGE_PAGES,
};

const PEER: i64 = 222;
const US: i64 = 111;

fn message(id: &str, at: i64, sender: i64, text: &str) -> Value {
	json!({
		"messageId": id,
		"conversationId": "111:222",
		"senderId": sender,
		"timestamp": at,
		"type": "Text",
		"body": { "text": text },
		"unsent": false,
		"reactions": [],
	})
}

fn page(messages: &[Value]) -> Answer {
	(
		200,
		json!({ "messages": messages, "lastReadTimestamp": null }),
	)
}

fn fetched(over: Value, answer: Answer) -> Poll {
	let entries = json!([conversation_entry(over)]);
	let pages = Pages::from([("111:222".to_owned(), answer)]);
	poll(Some(&inbox(entries)), &pages, None, SINCE, ME)
}

fn lines(result: &Poll) -> Vec<(&str, &str, &str)> {
	result
		.pushes
		.iter()
		.map(|push| {
			(
				push["notificationId"].as_str(),
				push["body"].as_str(),
				push["timestamp"].as_str(),
			)
		})
		.collect()
}

#[test]
fn a_burst_between_two_checks_becomes_one_line_per_message() {
	let result = fetched(
		json!({ "unreadCount": 2 }),
		page(&[
			message("2000:c0ffee", 2000, PEER, "hey"),
			message("1500:a", 1500, PEER, "hi"),
			message("900:old", 900, PEER, "earlier"),
		]),
	);

	assert_eq!(
		lines(&result),
		[
			("poll:111:222:1500:a", "hi", "1500"),
			("poll:111:222:2000:c0ffee", "hey", "2000"),
		]
	);
	for push in &result.pushes {
		assert_eq!(
			push["action"],
			"grindr://conversation?id=111:222&senderId=222"
		);
		assert_eq!(push["senderId"], "222");
		assert_eq!(push["title"], "Viktor");
	}
	assert_eq!(result.watermarks.inbox, 2000);
}

#[test]
fn the_newest_message_stays_even_when_its_time_is_after_the_inbox_activity() {
	let result = fetched(
		json!({
			"unreadCount": 2,
			"preview": { "messageId": "2001:late", "senderId": PEER, "type": "Text", "text": "late" },
		}),
		page(&[
			message("2001:late", 2001, PEER, "late"),
			message("1500:a", 1500, PEER, "hi"),
		]),
	);

	assert_eq!(
		lines(&result),
		[
			("poll:111:222:1500:a", "hi", "1500"),
			("poll:111:222:2001:late", "late", "2001"),
		]
	);
}

#[test]
fn a_message_sent_after_the_inbox_was_read_waits_for_the_next_check() {
	let result = fetched(
		json!({ "unreadCount": 2 }),
		page(&[
			message("2500:after", 2500, PEER, "newer"),
			message("2000:c0ffee", 2000, PEER, "hey"),
			message("1500:a", 1500, PEER, "hi"),
		]),
	);

	assert_eq!(
		lines(&result),
		[
			("poll:111:222:1500:a", "hi", "1500"),
			("poll:111:222:2000:c0ffee", "hey", "2000"),
		]
	);
	assert_eq!(result.watermarks.inbox, 2000);
}

#[test]
fn the_page_order_is_not_trusted() {
	let result = fetched(
		json!({ "unreadCount": 2 }),
		page(&[
			message("1500:a", 1500, PEER, "hi"),
			message("2000:c0ffee", 2000, PEER, "hey"),
		]),
	);

	assert_eq!(
		lines(&result),
		[
			("poll:111:222:1500:a", "hi", "1500"),
			("poll:111:222:2000:c0ffee", "hey", "2000"),
		]
	);
}

#[test]
fn only_the_peers_new_messages_that_still_stand_become_lines() {
	let mut unsent = message("1700:gone", 1700, PEER, "");
	unsent["unsent"] = json!(true);
	unsent["body"] = Value::Null;
	let mut retract = message("1600:retract", 1600, PEER, "");
	retract["type"] = json!("Retract");
	retract["body"] = json!({ "targetMessageId": "1700:gone" });

	let result = fetched(
		json!({ "unreadCount": 6 }),
		page(&[
			message("2000:c0ffee", 2000, PEER, "hey"),
			message("1800:ours", 1800, US, "on my way"),
			unsent,
			retract,
			message("1000:seen", 1000, PEER, "already announced"),
			message("900:older", 900, PEER, "older still"),
		]),
	);

	assert_eq!(
		lines(&result),
		[("poll:111:222:2000:c0ffee", "hey", "2000")]
	);
}

#[test]
fn a_long_burst_shows_the_newest_messages_a_card_can_hold() {
	let messages: Vec<Value> = (1..=12)
		.rev()
		.map(|n| {
			let id = if n == 12 {
				"2000:c0ffee".to_owned()
			} else {
				format!("{}:m{n}", 1000 + n * 50)
			};
			message(&id, if n == 12 { 2000 } else { 1000 + n * 50 }, PEER, "x")
		})
		.collect();

	let result = fetched(json!({ "unreadCount": 20 }), page(&messages));

	assert_eq!(result.pushes.len(), MESSAGE_LINES);
	assert_eq!(result.pushes[0]["notificationId"], "poll:111:222:1250:m5");
	assert_eq!(
		result.pushes[MESSAGE_LINES - 1]["notificationId"],
		"poll:111:222:2000:c0ffee"
	);
}

#[test]
fn a_burst_never_shows_more_lines_than_grindr_counts_unread() {
	let result = fetched(
		json!({ "unreadCount": 2 }),
		page(&[
			message("2000:c0ffee", 2000, PEER, "hey"),
			message("1500:b", 1500, PEER, "two"),
			message("1400:a", 1400, PEER, "one"),
		]),
	);

	assert_eq!(
		lines(&result),
		[
			("poll:111:222:1500:b", "two", "1500"),
			("poll:111:222:2000:c0ffee", "hey", "2000"),
		]
	);
}

fn our_reply_last() -> Value {
	json!({
		"preview": { "messageId": "2000:ours", "senderId": US, "type": "Text", "text": "on my way" },
	})
}

#[test]
fn our_reply_last_shows_the_peers_new_messages_before_it() {
	let result = fetched(
		our_reply_last(),
		page(&[
			message("2000:ours", 2000, US, "on my way"),
			message("1500:p", 1500, PEER, "where are you?"),
		]),
	);

	assert_eq!(
		lines(&result),
		[("poll:111:222:1500:p", "where are you?", "1500")]
	);
}

#[test]
fn our_reply_last_with_nothing_new_from_the_peer_announces_nothing_and_moves_on(
) {
	let result = fetched(
		our_reply_last(),
		page(&[
			message("2000:ours", 2000, US, "on my way"),
			message("900:p", 900, PEER, "already announced"),
		]),
	);

	assert!(result.pushes.is_empty());
	assert_eq!(result.watermarks.inbox, 2000);
}

#[test]
fn a_blocked_chat_announces_nothing_and_is_not_asked_about_again() {
	let result = fetched(
		json!({ "unreadCount": 2 }),
		(
			403,
			json!({ "type": "urn:gr:err:unauthorized_action", "status": 403 }),
		),
	);

	assert!(result.pushes.is_empty());
	assert_eq!(result.watermarks.inbox, 2000);
}

#[test]
fn a_page_open_grind_cannot_use_falls_back_to_todays_preview_line() {
	let without_preview = page(&[message("1500:a", 1500, PEER, "hi")]);
	for answer in [
		(500, json!({})),
		(403, json!({ "type": "urn:gr:err:forbidden" })),
		(200, json!({ "messages": "surprise" })),
		(200, Value::Null),
		without_preview,
	] {
		let result = fetched(json!({ "unreadCount": 2 }), answer);
		assert_eq!(
			lines(&result),
			[("poll:111:222:2000:c0ffee", "hey", "2000")]
		);
	}
}

#[test]
fn a_chat_whose_peer_is_unknown_keeps_todays_preview_line() {
	let result = fetched(
		json!({ "unreadCount": 2, "participants": [{ "profileId": US }] }),
		page(&[
			message("2000:c0ffee", 2000, PEER, "hey"),
			message("1500:a", 1500, PEER, "hi"),
		]),
	);

	assert_eq!(result.pushes.len(), 1);
	assert_eq!(
		result.pushes[0]["notificationId"],
		"poll:111:222:2000:c0ffee"
	);
}

#[test]
fn a_media_message_on_a_page_reads_like_its_preview_would() {
	for (message_type, body, expected, translated) in [
		(
			"Image",
			json!({ "mediaId": 7, "url": "https://x" }),
			"CHAT_IMAGE_NOTIFICATION_BODY",
			true,
		),
		(
			"AlbumContentReply",
			json!({ "albumContentReply": "nice" }),
			"nice",
			false,
		),
		(
			"ProfilePhotoReply",
			json!({ "photoContentReply": "cute" }),
			"cute",
			false,
		),
		("RightNowRequest", json!({}), GENERIC_BODY, true),
		("Text", Value::Null, GENERIC_BODY, true),
	] {
		let mut media = message("2000:c0ffee", 2000, PEER, "");
		media["type"] = json!(message_type);
		media["body"] = body;
		let result = fetched(
			json!({ "unreadCount": 2 }),
			page(&[media, message("1500:a", 1500, PEER, "hi")]),
		);

		let push = &result.pushes[1];
		assert_eq!(push["body"], expected, "{message_type}");
		assert_eq!(
			push.contains_key("translateBody"),
			translated,
			"{message_type}"
		);
	}
}

fn wanted(entries: Value) -> Vec<String> {
	pages_wanted(Some(&inbox(entries)), SINCE.inbox, ME)
}

#[test]
fn one_new_message_needs_no_page() {
	assert!(wanted(json!([conversation_entry(json!({}))])).is_empty());
}

#[test]
fn several_unread_messages_ask_for_the_page_whatever_the_card_shows() {
	let entries = json!([conversation_entry(json!({ "unreadCount": 2 }))]);

	assert_eq!(wanted(entries), ["111:222"]);
}

#[test]
fn our_reply_last_asks_for_the_page() {
	let entries = json!([conversation_entry(our_reply_last())]);

	assert_eq!(wanted(entries), ["111:222"]);
}

#[test]
fn quiet_muted_or_read_chats_ask_for_nothing() {
	for over in [
		json!({ "unreadCount": 2, "lastActivityTimestamp": SINCE.inbox }),
		json!({ "unreadCount": 2, "muted": true }),
		json!({ "unreadCount": 0 }),
	] {
		assert!(wanted(json!([conversation_entry(over)])).is_empty());
	}
}

#[test]
fn only_a_few_pages_are_fetched_per_check_newest_chats_first() {
	let entries: Vec<Value> = (1..=MESSAGE_PAGES + 2)
		.map(|n| {
			conversation_entry(json!({
				"conversationId": format!("111:{n}"),
				"lastActivityTimestamp": 2000 - n as i64,
				"unreadCount": 2,
			}))
		})
		.collect();

	let ids = wanted(json!(entries));

	assert_eq!(ids.len(), MESSAGE_PAGES);
	assert_eq!(ids[0], "111:1");
}
