use serde_json::Value;

use super::Push;

pub(in crate::push_poll) const GENERIC_BODY: &str =
	"CHAT_MESSAGE_NOTIFICATION_BODY";
pub(super) const TAP_BODY: &str = "TAP_NOTIFICATION_BODY";

pub(super) const MESSAGE_BODIES: [(&str, &[&str]); 9] = [
	(
		"CHAT_IMAGE_NOTIFICATION_BODY",
		&["Image", "ProfilePhotoReply"],
	),
	("CHAT_EXPIRING_IMAGE_NOTIFICATION_BODY", &["ExpiringImage"]),
	(
		"CHAT_ALBUM_NOTIFICATION_BODY",
		&[
			"Album",
			"ExpiringAlbum",
			"ExpiringAlbumV2",
			"AlbumContentReply",
		],
	),
	(
		"CHAT_ALBUM_CONTENT_REACTION_NOTIFICATION_BODY",
		&["AlbumContentReaction"],
	),
	("CHAT_AUDIO_NOTIFICATION_BODY", &["Audio"]),
	(
		"CHAT_VIDEO_NOTIFICATION_BODY",
		&["Video", "PrivateVideo", "NonExpiringVideo"],
	),
	("CHAT_GAYMOJI_NOTIFICATION_BODY", &["Gaymoji"]),
	("CHAT_GIF_NOTIFICATION_BODY", &["Giphy"]),
	("CHAT_LOCATION_NOTIFICATION_BODY", &["Location"]),
];

#[cfg(test)]
pub(in crate::push_poll) const BODY_KEYS: [&str; MESSAGE_BODIES.len() + 2] = {
	let mut keys = [GENERIC_BODY; MESSAGE_BODIES.len() + 2];
	let mut index = 0;
	while index < MESSAGE_BODIES.len() {
		keys[index] = MESSAGE_BODIES[index].0;
		index += 1;
	}
	keys[index] = TAP_BODY;
	keys
};

fn body_key(message_type: &str) -> Option<&'static str> {
	MESSAGE_BODIES
		.iter()
		.find(|(_, types)| types.contains(&message_type))
		.map(|(key, _)| *key)
}

pub(super) fn describe(preview: &Value, push: &mut Push) {
	if let Some(text) = preview["text"].as_str().filter(|text| !text.is_empty())
	{
		push.insert("body", text.to_owned());
		return;
	}
	let key = preview["type"]
		.as_str()
		.and_then(body_key)
		.unwrap_or(GENERIC_BODY);
	set_body_key(push, key);
}

pub(super) fn set_body_key(push: &mut Push, key: &str) {
	push.insert("body", key.to_owned());
	push.insert("translateBody", "true".to_owned());
}
