use serde_json::Value;

use super::body::{describe, set_body_key, GENERIC_BODY};
use super::{
	base, cleared, line_key, profile_id, Push, CATCH_UP_LINE, CHATS_CHANNEL,
	CONVERSATION_DEEPLINK,
};

pub(super) struct Conversation<'a> {
	id: &'a str,
	pub(super) at: i64,
	peer: Option<String>,
	sent_last: bool,
	data: &'a Value,
}

impl<'a> Conversation<'a> {
	pub(super) fn parse(data: &'a Value, me: Option<&str>) -> Option<Self> {
		let peer = data["participants"]
			.as_array()
			.into_iter()
			.flatten()
			.filter_map(|participant| profile_id(&participant["profileId"]))
			.find(|profile| Some(profile.as_str()) != me);
		let sender = profile_id(&data["preview"]["senderId"]);
		Some(Self {
			id: data["conversationId"].as_str()?,
			at: data["lastActivityTimestamp"].as_i64()?,
			peer,
			sent_last: me.is_some() && sender.as_deref() == me,
			data,
		})
	}

	pub(super) fn message(&self, since: i64) -> Option<Push> {
		let unread = self.data["unreadCount"].as_i64().unwrap_or_default();
		let muted = self.data["muted"].as_bool().unwrap_or(false);
		if self.at <= since || unread <= 0 || muted {
			return None;
		}

		let mut push =
			base(self.at, line_key(self.id, &self.line()), CHATS_CHANNEL);
		let conversation = format!("{CONVERSATION_DEEPLINK}{}", self.id);
		match &self.peer {
			Some(peer) => {
				push.insert(
					"action",
					format!("{conversation}&senderId={peer}"),
				);
				push.insert("senderId", peer.clone());
			}
			None => {
				push.insert("action", conversation);
			}
		}
		if let Some(name) =
			self.data["name"].as_str().filter(|name| !name.is_empty())
		{
			push.insert("title", name.to_owned());
		}

		if self.sent_last {
			set_body_key(&mut push, GENERIC_BODY);
		} else {
			describe(&self.data["preview"], &mut push);
		}
		Some(push)
	}

	fn line(&self) -> String {
		if self.sent_last {
			return CATCH_UP_LINE.to_owned();
		}
		self.data["preview"]["messageId"]
			.as_str()
			.filter(|message| !message.is_empty())
			.map_or_else(|| self.at.to_string(), str::to_owned)
	}

	pub(super) fn read_elsewhere(&self) -> Option<Push> {
		if self.data["unreadCount"].as_i64() != Some(0) {
			return None;
		}
		let mut push = cleared(self.id);
		push.insert("notificationId", format!("poll:clear:{}", self.id));
		push.insert("timestamp", self.at.to_string());
		Some(push)
	}
}
