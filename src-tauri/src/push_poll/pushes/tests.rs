use super::body::MESSAGE_BODIES;
use super::inbox::{continues, INBOX_PAGES};
use super::*;
use serde_json::json;

const ME: Option<&str> = Some("111");
const SINCE: Watermarks = Watermarks {
	inbox: 1000,
	taps: 1000,
};

fn conversation_entry(over: Value) -> Value {
	let mut data = json!({
		"conversationId": "111:222",
		"name": "Viktor",
		"participants": [{ "profileId": 111 }, { "profileId": 222 }],
		"lastActivityTimestamp": 2000,
		"unreadCount": 1,
		"muted": false,
		"preview": {
			"messageId": "2000:c0ffee",
			"senderId": 222,
			"type": "Text",
			"text": "hey",
		},
	});
	let (Value::Object(data_map), Value::Object(over)) = (&mut data, over)
	else {
		unreachable!()
	};
	data_map.extend(over);
	json!({ "type": "full_conversation_v1", "data": data })
}

fn inbox(entries: Value) -> Inbox {
	let mut inbox = Inbox::default();
	inbox.read(&json!({ "entries": entries }), SINCE.inbox);
	inbox
}

fn taps(profiles: Value) -> Value {
	json!({ "profiles": profiles })
}

fn polled(entries: Value, profiles: Value) -> Poll {
	poll(Some(&inbox(entries)), Some(&taps(profiles)), SINCE, ME)
}

fn page(timestamps: &[i64], next_page: Value) -> Value {
	let entries: Vec<Value> = timestamps
		.iter()
		.map(|at| {
			conversation_entry(json!({
				"conversationId": format!("111:{at}"),
				"lastActivityTimestamp": at,
			}))
		})
		.collect();
	json!({ "entries": entries, "nextPage": next_page })
}

#[test]
fn an_unread_conversation_becomes_the_same_payload_a_push_would_carry() {
	let result = polled(json!([conversation_entry(json!({}))]), json!([]));
	let push = &result.pushes[0];
	assert_eq!(push["version"], "2");
	assert_eq!(push["notificationId"], "poll:111:222:2000:c0ffee");
	assert_eq!(push["channel"], CHATS_CHANNEL);
	assert_eq!(
		push["action"],
		"grindr://conversation?id=111:222&senderId=222"
	);
	assert_eq!(push["title"], "Viktor");
	assert_eq!(push["body"], "hey");
	assert_eq!(push["senderId"], "222");
	assert_eq!(push["timestamp"], "2000");
	assert!(!push.contains_key("translateBody"));
	assert_eq!(result.watermarks.inbox, 2000);
}

#[test]
fn the_envelope_is_the_shape_the_poll_job_decodes() {
	let envelope =
		serde_json::to_value(Poll::unchanged(Watermarks { inbox: 1, taps: 2 }))
			.unwrap();
	assert_eq!(
		envelope,
		json!({ "inboxWatermark": 1, "tapsWatermark": 2, "pushes": [] })
	);
}

#[test]
fn a_media_message_carries_the_key_the_renderer_already_translates() {
	for (message_type, key) in [
		("Image", "CHAT_IMAGE_NOTIFICATION_BODY"),
		("Audio", "CHAT_AUDIO_NOTIFICATION_BODY"),
		("Giphy", "CHAT_GIF_NOTIFICATION_BODY"),
		("ExpiringAlbumV2", "CHAT_ALBUM_NOTIFICATION_BODY"),
	] {
		let entry = conversation_entry(
			json!({ "preview": { "type": message_type, "text": null } }),
		);
		let result = polled(json!([entry]), json!([]));
		assert_eq!(result.pushes[0]["body"], key);
		assert_eq!(result.pushes[0]["translateBody"], "true");
	}
}

#[test]
fn a_message_type_with_no_wording_still_says_something() {
	for over in [
		json!({ "preview": { "type": "RightNowRequest", "text": null } }),
		json!({ "preview": null }),
	] {
		let result = polled(json!([conversation_entry(over)]), json!([]));
		assert_eq!(result.pushes[0]["body"], GENERIC_BODY);
		assert_eq!(result.pushes[0]["translateBody"], "true");
	}
}

fn our_reply(message_id: &str, at: i64) -> Value {
	conversation_entry(json!({
		"lastActivityTimestamp": at,
		"preview": { "messageId": message_id, "senderId": 111, "type": "Text", "text": "on my way" },
	}))
}

#[test]
fn our_own_last_message_is_one_generic_catch_up_for_the_peers_unread_ones() {
	for sender in [json!(111), json!("111")] {
		let entry = conversation_entry(json!({
			"preview": { "messageId": "2000:ours", "senderId": sender, "type": "Text", "text": "on my way" },
		}));
		let result = polled(json!([entry]), json!([]));
		assert_eq!(result.pushes.len(), 1);
		let push = &result.pushes[0];
		assert_eq!(push["notificationId"], "poll:111:222:unread");
		assert_eq!(push["body"], GENERIC_BODY);
		assert_eq!(push["translateBody"], "true");
		assert_eq!(push["senderId"], "222");
		assert!(push.values().all(|value| !value.contains("on my way")));
	}
}

#[test]
fn every_reply_of_ours_catches_up_under_the_same_key() {
	let first = polled(json!([our_reply("2000:a", 2000)]), json!([]));
	let second = polled(json!([our_reply("3000:b", 3000)]), json!([]));
	assert_eq!(
		first.pushes[0]["notificationId"],
		second.pushes[0]["notificationId"]
	);
}

#[test]
fn every_body_key_the_poll_emits_is_in_its_vocabulary() {
	for message_type in MESSAGE_BODIES.iter().flat_map(|(_, types)| *types) {
		let entry = conversation_entry(
			json!({ "preview": { "type": message_type, "text": null } }),
		);
		let result = polled(json!([entry]), json!([]));
		assert!(BODY_KEYS.contains(&result.pushes[0]["body"].as_str()));
	}
	assert!(BODY_KEYS.contains(&GENERIC_BODY));
	assert!(BODY_KEYS.contains(&TAP_BODY));
}

#[test]
fn a_profile_id_is_read_whether_the_wire_sends_a_number_or_a_string() {
	for id in [json!(333), json!("333")] {
		let result =
			polled(json!([]), json!([{ "profileId": id, "timestamp": 2500 }]));
		assert_eq!(result.pushes[0]["notificationId"], "poll:tap:333");
		assert_eq!(result.pushes[0]["senderId"], "333");
	}
}

#[test]
fn nothing_older_than_the_watermark_is_announced_again() {
	let entry = conversation_entry(json!({ "lastActivityTimestamp": 1000 }));
	let result = polled(json!([entry]), json!([]));
	assert!(result.pushes.is_empty());
	assert_eq!(result.watermarks, SINCE);
}

#[test]
fn a_muted_conversation_is_not_announced() {
	let result = polled(
		json!([conversation_entry(json!({ "muted": true }))]),
		json!([]),
	);
	assert!(result.pushes.is_empty());
	assert_eq!(result.watermarks, SINCE);
}

fn read_elsewhere(mut over: Value) -> Push {
	over["unreadCount"] = json!(0);
	over["lastActivityTimestamp"] = json!(3000);
	let result = polled(json!([conversation_entry(over)]), json!([]));
	assert_eq!(result.pushes.len(), 1);
	assert_eq!(result.watermarks, SINCE);
	result.pushes[0].clone()
}

#[test]
fn a_conversation_read_elsewhere_clears_its_notification_without_advancing() {
	for muted in [false, true] {
		assert_eq!(
			read_elsewhere(json!({ "muted": muted })),
			Push::from([
				("version", "2".to_owned()),
				("action", "grindr://clear?conversationId=111:222".to_owned()),
				("notificationId", "poll:clear:111:222".to_owned()),
				("timestamp", "3000".to_owned()),
			])
		);
	}
}

#[test]
fn a_read_conversation_is_cleared_whatever_the_taps_say() {
	let read = inbox(json!([conversation_entry(
		json!({ "unreadCount": 0, "lastActivityTimestamp": 3000 })
	)]));
	let cleared = |taps: Option<Value>| {
		let result = poll(Some(&read), taps.as_ref(), SINCE, ME);
		result
			.pushes
			.iter()
			.filter(|push| push["action"] == format!("{CLEAR_DEEPLINK}111:222"))
			.count()
	};
	for profiles in [
		json!([]),
		json!([{ "profileId": 222, "timestamp": 2500 }]),
		json!([{ "profileId": 222, "timestamp": 4000 }]),
	] {
		assert_eq!(cleared(Some(taps(profiles))), 1);
	}
	for unknown in [None, Some(json!({})), Some(json!({ "profiles": 7 }))] {
		assert_eq!(cleared(unknown), 1);
	}
}

#[test]
fn a_read_conversation_leaves_the_peers_new_tap_to_be_announced() {
	let read = conversation_entry(
		json!({ "unreadCount": 0, "lastActivityTimestamp": 3000 }),
	);
	let result = polled(
		json!([read]),
		json!([{ "profileId": 222, "timestamp": 2500 }]),
	);
	let actions: Vec<&str> = result
		.pushes
		.iter()
		.map(|push| push["action"].as_str())
		.collect();
	assert_eq!(
		actions,
		["grindr://clear?conversationId=111:222", TAPS_DEEPLINK]
	);
}

#[test]
fn a_read_conversation_with_no_known_peer_is_still_cleared() {
	let push =
		read_elsewhere(json!({ "participants": [{ "profileId": 111 }] }));
	assert_eq!(push["action"], format!("{CLEAR_DEEPLINK}111:222"));
}

#[test]
fn every_message_gets_its_own_notification_id() {
	let first = conversation_entry(json!({
		"preview": { "messageId": "2000:a", "senderId": 222, "type": "Text", "text": "hi" },
	}));
	let reply = conversation_entry(json!({
		"lastActivityTimestamp": 3000,
		"preview": { "messageId": "3000:b", "senderId": 222, "type": "Text", "text": "you there?" },
	}));
	let a = polled(json!([first]), json!([]));
	let b = polled(json!([reply]), json!([]));
	assert_eq!(a.pushes[0]["notificationId"], "poll:111:222:2000:a");
	assert_eq!(b.pushes[0]["notificationId"], "poll:111:222:3000:b");
	assert_eq!(a.pushes[0]["action"], b.pushes[0]["action"]);
}

#[test]
fn a_preview_without_a_message_id_falls_back_to_the_activity_time() {
	let entry = conversation_entry(
		json!({ "preview": { "senderId": 222, "type": "Text", "text": "hey" } }),
	);
	let result = polled(json!([entry]), json!([]));
	assert_eq!(result.pushes[0]["notificationId"], "poll:111:222:2000");
}

#[test]
fn a_tap_becomes_a_tap_channel_payload() {
	let result = polled(
		json!([]),
		json!([{ "profileId": "333", "displayName": "Sam", "timestamp": 2500 }]),
	);
	let push = &result.pushes[0];
	assert_eq!(push["channel"], TAPS_CHANNEL);
	assert_eq!(push["action"], "grindr://taps-inbox");
	assert_eq!(push["notificationId"], "poll:tap:333");
	assert_eq!(push["title"], "Sam");
	assert_eq!(push["body"], "TAP_NOTIFICATION_BODY");
	assert_eq!(push["translateBody"], "true");
	assert_eq!(result.watermarks.taps, 2500);
}

#[test]
fn a_nameless_tap_leaves_the_title_to_the_renderer() {
	let result =
		polled(json!([]), json!([{ "profileId": 333, "timestamp": 2500 }]));
	assert!(!result.pushes[0].contains_key("title"));
}

#[test]
fn each_source_advances_only_its_own_watermark() {
	let result = polled(
		json!([conversation_entry(json!({ "lastActivityTimestamp": 4000 }))]),
		json!([{ "profileId": 333, "timestamp": 2500 }]),
	);
	assert_eq!(result.pushes.len(), 2);
	assert_eq!(
		result.watermarks,
		Watermarks {
			inbox: 4000,
			taps: 2500
		}
	);
}

#[test]
fn a_failed_source_keeps_its_watermark_and_announces_nothing() {
	let since = Watermarks {
		inbox: 1000,
		taps: 500,
	};
	let unread = inbox(json!([conversation_entry(json!({}))]));
	let tapped = taps(json!([{ "profileId": 333, "timestamp": 2500 }]));

	let without_taps = poll(Some(&unread), None, since, ME);
	assert_eq!(without_taps.pushes.len(), 1);
	assert_eq!(
		without_taps.watermarks,
		Watermarks {
			inbox: 2000,
			taps: 500
		}
	);

	let without_inbox = poll(None, Some(&tapped), since, ME);
	assert_eq!(without_inbox.pushes.len(), 1);
	assert_eq!(without_inbox.pushes[0]["channel"], TAPS_CHANNEL);
	assert_eq!(
		without_inbox.watermarks,
		Watermarks {
			inbox: 1000,
			taps: 2500
		}
	);

	assert_eq!(poll(None, None, since, ME), Poll::unchanged(since));
}

#[test]
fn a_response_open_grind_cannot_read_announces_nothing_rather_than_failing() {
	for (inbox_page, taps) in [
		(json!({}), json!({})),
		(json!({ "entries": "surprise" }), json!({ "profiles": 7 })),
		(json!({ "entries": [{}] }), json!({ "profiles": [{}] })),
		(json!(null), json!(null)),
	] {
		let mut inbox = Inbox::default();
		assert_eq!(inbox.read(&inbox_page, SINCE.inbox), None);
		let result = poll(Some(&inbox), Some(&taps), SINCE, ME);
		assert_eq!(result, Poll::unchanged(SINCE));
	}
}

#[test]
fn our_own_profile_is_never_the_sender_of_a_message_to_us() {
	let entry = conversation_entry(
		json!({ "participants": [{ "profileId": 222 }, { "profileId": 111 }] }),
	);
	let result = polled(json!([entry]), json!([]));
	assert_eq!(result.pushes[0]["senderId"], "222");
}

#[test]
fn the_walk_goes_on_only_while_a_next_page_can_still_hold_news() {
	assert!(continues(&page(&[3000, 2000], json!(2)), 1000));
	assert!(!continues(&page(&[3000, 1000], json!(2)), 1000));
	assert!(!continues(&page(&[3000, 900], json!(2)), 1000));
	assert!(!continues(&page(&[3000, 2000], json!(null)), 1000));
	assert!(!continues(&json!({ "entries": [{ "data": {} }] }), 1000));
	assert!(!continues(&page(&[], json!(2)), 1000));
}

#[test]
fn inbox_pages_are_numbered_in_order_and_merged_without_repeats() {
	let mut inbox = Inbox::default();
	assert_eq!(inbox.read(&page(&[5000, 4000], json!(2)), 1000), Some(2));
	assert_eq!(inbox.read(&page(&[4000, 3000], json!(3)), 1000), Some(3));
	assert_eq!(inbox.read(&page(&[900], json!(4)), 1000), None);
	let ids: Vec<&str> = inbox
		.entries
		.iter()
		.filter_map(|data| data["conversationId"].as_str())
		.collect();
	assert_eq!(ids, ["111:5000", "111:4000", "111:3000", "111:900"]);
}

fn walk(pages: &[Value], watermark: i64) -> (u32, Inbox) {
	let mut inbox = Inbox::default();
	let mut fetched = 0;
	for page in pages {
		fetched += 1;
		if inbox.read(page, watermark).is_none() {
			break;
		}
	}
	(fetched, inbox)
}

#[test]
fn a_walk_cut_short_by_the_page_cap_advances_to_the_newest_announced_conversation(
) {
	let pages: Vec<Value> = (1..=INBOX_PAGES + 2)
		.map(|number| {
			let newest = 10_000 - i64::from(number) * 1000;
			page(&[newest, newest - 500], json!(number + 1))
		})
		.collect();

	let (fetched, capped) = walk(&pages, SINCE.inbox);
	assert_eq!(fetched, INBOX_PAGES);
	let result = poll(Some(&capped), None, SINCE, ME);
	assert_eq!(result.pushes.len(), 10);
	assert_eq!(result.watermarks.inbox, 9000);

	let (_, again) = walk(&pages, result.watermarks.inbox);
	let next = poll(Some(&again), None, result.watermarks, ME);
	assert!(next.pushes.is_empty());
	assert_eq!(next.watermarks, result.watermarks);
}
