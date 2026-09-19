use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;

pub type Push = BTreeMap<&'static str, String>;

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Poll {
	pub watermark: i64,
	pub pushes: Vec<Push>,
}

const GENERIC_BODY: &str = "CHAT_MESSAGE_NOTIFICATION_BODY";
const CHATS_CHANNEL: &str = "id_grindr_notifications_channel_individual_v2";
const TAPS_CHANNEL: &str = "id_grindr_notifications_channel_tap_v2";

fn body_key(message_type: &str) -> Option<&'static str> {
	match message_type {
		"Image" | "ProfilePhotoReply" => Some("CHAT_IMAGE_NOTIFICATION_BODY"),
		"ExpiringImage" => Some("CHAT_EXPIRING_IMAGE_NOTIFICATION_BODY"),
		"Album" | "ExpiringAlbum" | "ExpiringAlbumV2" | "AlbumContentReply" => {
			Some("CHAT_ALBUM_NOTIFICATION_BODY")
		}
		"AlbumContentReaction" => {
			Some("CHAT_ALBUM_CONTENT_REACTION_NOTIFICATION_BODY")
		}
		"Audio" => Some("CHAT_AUDIO_NOTIFICATION_BODY"),
		"Video" | "PrivateVideo" | "NonExpiringVideo" => {
			Some("CHAT_VIDEO_NOTIFICATION_BODY")
		}
		"Gaymoji" => Some("CHAT_GAYMOJI_NOTIFICATION_BODY"),
		"Giphy" => Some("CHAT_GIF_NOTIFICATION_BODY"),
		"Location" => Some("CHAT_LOCATION_NOTIFICATION_BODY"),
		_ => None,
	}
}

pub fn poll(inbox: &Value, taps: &Value, since: i64, me: Option<&str>) -> Poll {
	let mut poll = Poll {
		watermark: since,
		..Poll::default()
	};
	for entry in inbox["entries"].as_array().into_iter().flatten() {
		if let Some(push) = conversation(&entry["data"], since, me) {
			poll.advance(&push);
			poll.pushes.push(push);
		}
	}
	for profile in taps["profiles"].as_array().into_iter().flatten() {
		if let Some(push) = tap(profile, since) {
			poll.advance(&push);
			poll.pushes.push(push);
		}
	}
	poll
}

impl Poll {
	fn advance(&mut self, push: &Push) {
		let at = push
			.get("timestamp")
			.and_then(|at| at.parse::<i64>().ok())
			.unwrap_or_default();
		self.watermark = self.watermark.max(at);
	}
}

fn conversation(data: &Value, since: i64, me: Option<&str>) -> Option<Push> {
	let at = data["lastActivityTimestamp"].as_i64()?;
	let id = data["conversationId"].as_str()?;
	let unread = data["unreadCount"].as_i64().unwrap_or_default();
	if at <= since || unread <= 0 || data["muted"].as_bool().unwrap_or(false) {
		return None;
	}

	let sender = data["participants"]
		.as_array()
		.into_iter()
		.flatten()
		.filter_map(|participant| profile_id(&participant["profileId"]))
		.find(|profile| Some(profile.as_str()) != me);

	let mut push = base(at, format!("poll:{id}"), CHATS_CHANNEL);
	push.insert(
		"action",
		match &sender {
			Some(sender) => {
				format!("grindr://conversation?id={id}&senderId={sender}")
			}
			None => format!("grindr://conversation?id={id}"),
		},
	);
	if let Some(sender) = sender {
		push.insert("senderId", sender);
	}
	if let Some(name) = data["name"].as_str().filter(|name| !name.is_empty()) {
		push.insert("title", name.to_owned());
	}
	describe(&data["preview"], &mut push);
	Some(push)
}

fn describe(preview: &Value, push: &mut Push) {
	let text = preview["text"].as_str().filter(|text| !text.is_empty());
	if let Some(text) = text {
		push.insert("body", text.to_owned());
		return;
	}
	let key = preview["type"]
		.as_str()
		.and_then(body_key)
		.unwrap_or(GENERIC_BODY);
	push.insert("body", key.to_owned());
	push.insert("translateBody", "true".to_owned());
}

fn profile_id(value: &Value) -> Option<String> {
	value
		.as_i64()
		.map(|id| id.to_string())
		.or_else(|| value.as_str().map(str::to_owned))
		.filter(|id| !id.is_empty())
}

fn tap(profile: &Value, since: i64) -> Option<Push> {
	let at = profile["timestamp"].as_i64()?;
	let id = profile_id(&profile["profileId"])?;
	if at <= since {
		return None;
	}
	let mut push = base(at, format!("poll:tap:{id}"), TAPS_CHANNEL);
	push.insert("action", "grindr://taps-inbox".to_owned());
	push.insert("senderId", id);
	push.insert("body", "TAP_NOTIFICATION_BODY".to_owned());
	push.insert("translateBody", "true".to_owned());
	if let Some(name) = profile["displayName"]
		.as_str()
		.filter(|name| !name.is_empty())
	{
		push.insert("title", name.to_owned());
	}
	Some(push)
}

fn base(at: i64, notification_id: String, channel: &str) -> Push {
	Push::from([
		("version", "2".to_owned()),
		("notificationId", notification_id),
		("channel", channel.to_owned()),
		("timestamp", at.to_string()),
	])
}

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;

	const ME: Option<&str> = Some("111");

	fn inbox(entries: Value) -> Value {
		json!({ "entries": entries })
	}

	fn conversation_entry(over: Value) -> Value {
		let mut data = json!({
			"conversationId": "111:222",
			"name": "Viktor",
			"participants": [{ "profileId": 111 }, { "profileId": 222 }],
			"lastActivityTimestamp": 2000,
			"unreadCount": 1,
			"muted": false,
			"preview": { "type": "Text", "text": "hey" },
		});
		let (Value::Object(data_map), Value::Object(over)) =
			(&mut data, over.clone())
		else {
			unreachable!()
		};
		data_map.extend(over);
		json!({ "type": "full_conversation_v1", "data": data })
	}

	fn taps(profiles: Value) -> Value {
		json!({ "profiles": profiles })
	}

	#[test]
	fn an_unread_conversation_becomes_the_same_payload_a_push_would_carry() {
		let result = poll(
			&inbox(json!([conversation_entry(json!({}))])),
			&json!({}),
			1000,
			ME,
		);
		let push = &result.pushes[0];
		assert_eq!(push["version"], "2");
		assert_eq!(push["notificationId"], "poll:111:222");
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
		assert_eq!(result.watermark, 2000);
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
			let result = poll(&inbox(json!([entry])), &json!({}), 1000, ME);
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
			let result = poll(
				&inbox(json!([conversation_entry(over)])),
				&json!({}),
				1000,
				ME,
			);
			assert_eq!(result.pushes[0]["body"], GENERIC_BODY);
			assert_eq!(result.pushes[0]["translateBody"], "true");
		}
	}

	#[test]
	fn a_profile_id_is_read_whether_the_wire_sends_a_number_or_a_string() {
		for id in [json!(333), json!("333")] {
			let result = poll(
				&json!({}),
				&taps(json!([{ "profileId": id, "timestamp": 2500 }])),
				1000,
				ME,
			);
			assert_eq!(result.pushes[0]["notificationId"], "poll:tap:333");
			assert_eq!(result.pushes[0]["senderId"], "333");
		}
	}

	#[test]
	fn nothing_older_than_the_watermark_is_announced_again() {
		let entry =
			conversation_entry(json!({ "lastActivityTimestamp": 1000 }));
		let result = poll(&inbox(json!([entry])), &json!({}), 1000, ME);
		assert!(result.pushes.is_empty());
		assert_eq!(result.watermark, 1000);
	}

	#[test]
	fn a_read_or_muted_conversation_is_not_announced() {
		for over in [json!({ "unreadCount": 0 }), json!({ "muted": true })] {
			let result = poll(
				&inbox(json!([conversation_entry(over)])),
				&json!({}),
				1000,
				ME,
			);
			assert!(result.pushes.is_empty());
		}
	}

	#[test]
	fn one_notification_per_conversation_so_a_reply_replaces_the_last_one() {
		let first =
			conversation_entry(json!({ "lastActivityTimestamp": 2000 }));
		let later =
			conversation_entry(json!({ "lastActivityTimestamp": 3000 }));
		let a = poll(&inbox(json!([first])), &json!({}), 1000, ME);
		let b = poll(&inbox(json!([later])), &json!({}), 1000, ME);
		assert_eq!(
			a.pushes[0]["notificationId"],
			b.pushes[0]["notificationId"]
		);
	}

	#[test]
	fn a_tap_becomes_a_tap_channel_payload() {
		let result = poll(
			&json!({}),
			&taps(json!([
				{ "profileId": "333", "displayName": "Sam", "timestamp": 2500 },
			])),
			1000,
			ME,
		);
		let push = &result.pushes[0];
		assert_eq!(push["channel"], TAPS_CHANNEL);
		assert_eq!(push["action"], "grindr://taps-inbox");
		assert_eq!(push["notificationId"], "poll:tap:333");
		assert_eq!(push["title"], "Sam");
		assert_eq!(push["body"], "TAP_NOTIFICATION_BODY");
		assert_eq!(push["translateBody"], "true");
		assert_eq!(result.watermark, 2500);
	}

	#[test]
	fn a_nameless_tap_leaves_the_title_to_the_renderer() {
		let result = poll(
			&json!({}),
			&taps(json!([{ "profileId": 333, "timestamp": 2500 }])),
			1000,
			ME,
		);
		assert!(!result.pushes[0].contains_key("title"));
	}

	#[test]
	fn the_watermark_is_the_newest_thing_seen_across_both_sources() {
		let result = poll(
			&inbox(json!([conversation_entry(
				json!({ "lastActivityTimestamp": 4000 })
			)])),
			&taps(json!([{ "profileId": 333, "timestamp": 2500 }])),
			1000,
			ME,
		);
		assert_eq!(result.pushes.len(), 2);
		assert_eq!(result.watermark, 4000);
	}

	#[test]
	fn a_response_open_grind_cannot_read_announces_nothing_rather_than_failing()
	{
		for (inbox, taps) in [
			(json!({}), json!({})),
			(json!({ "entries": "surprise" }), json!({ "profiles": 7 })),
			(json!({ "entries": [{}] }), json!({ "profiles": [{}] })),
			(json!(null), json!(null)),
		] {
			let result = poll(&inbox, &taps, 1000, ME);
			assert!(result.pushes.is_empty());
			assert_eq!(result.watermark, 1000);
		}
	}

	#[test]
	fn our_own_profile_is_never_the_sender_of_a_message_to_us() {
		let entry = conversation_entry(
			json!({ "participants": [{ "profileId": 222 }, { "profileId": 111 }] }),
		);
		let result = poll(&inbox(json!([entry])), &json!({}), 1000, ME);
		assert_eq!(result.pushes[0]["senderId"], "222");
	}
}
