use serde_json::Value;

use super::body::{describe, describe_message, set_body_key, GENERIC_BODY};
use super::page::{self, Page};
use super::{
	base, cleared, line_key, profile_id, Answer, Push, CATCH_UP_LINE,
	CHATS_CHANNEL, CONVERSATION_DEEPLINK,
};

pub(super) struct Conversation<'a> {
	pub(super) id: &'a str,
	pub(super) at: i64,
	pub(super) peer: Option<String>,
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

	pub(super) fn unread(&self) -> i64 {
		self.data["unreadCount"].as_i64().unwrap_or_default()
	}

	pub(super) fn preview_id(&self) -> Option<&'a str> {
		self.data["preview"]["messageId"]
			.as_str()
			.filter(|message| !message.is_empty())
	}

	fn announces(&self, since: i64) -> bool {
		let muted = self.data["muted"].as_bool().unwrap_or(false);
		self.at > since && self.unread() > 0 && !muted
	}

	pub(super) fn wants_page(&self, since: i64) -> bool {
		self.announces(since) && (self.sent_last || self.unread() > 1)
	}

	pub(super) fn messages(
		&self,
		since: i64,
		answer: Option<&Answer>,
	) -> Option<Vec<Push>> {
		if !self.announces(since) {
			return None;
		}
		let Some(answer) = answer else {
			return Some(vec![self.preview()]);
		};
		Some(match page::read(answer, self, since) {
			Page::Unreadable => vec![self.preview()],
			Page::Blocked => Vec::new(),
			Page::Messages(messages) => messages
				.into_iter()
				.filter_map(|message| self.message(message))
				.collect(),
		})
	}

	fn preview(&self) -> Push {
		let mut push = self.push(self.at, &self.line());
		if self.sent_last {
			set_body_key(&mut push, GENERIC_BODY);
		} else {
			describe(&self.data["preview"], &mut push);
		}
		push
	}

	fn message(&self, message: &Value) -> Option<Push> {
		let id = message["messageId"].as_str()?;
		let at = message["timestamp"].as_i64()?;
		let mut push = self.push(at, id);
		describe_message(message, &mut push);
		Some(push)
	}

	fn push(&self, at: i64, line: &str) -> Push {
		let mut push = base(at, line_key(self.id, line), CHATS_CHANNEL);
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
		push
	}

	fn line(&self) -> String {
		if self.sent_last {
			return CATCH_UP_LINE.to_owned();
		}
		self.preview_id()
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
