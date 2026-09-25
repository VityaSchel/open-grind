mod body;
mod conversation;
mod inbox;
mod page;
#[cfg(test)]
mod tests;
mod withdrawals;

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use serde_json::Value;

use body::{set_body_key, TAP_BODY};
#[cfg(test)]
pub(super) use body::{BODY_KEYS, GENERIC_BODY};
use conversation::Conversation;
pub use inbox::Inbox;
pub use withdrawals::ShownConversation;

pub type Push = BTreeMap<&'static str, String>;

pub type Answer = (u16, Value);

pub type Pages = HashMap<String, Answer>;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Watermarks {
	#[serde(rename = "inboxWatermark")]
	pub inbox: i64,
	#[serde(rename = "tapsWatermark")]
	pub taps: i64,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct Poll {
	#[serde(flatten)]
	pub watermarks: Watermarks,
	pub pushes: Vec<Push>,
}

impl Poll {
	pub fn unchanged(watermarks: Watermarks) -> Self {
		Self {
			watermarks,
			pushes: Vec::new(),
		}
	}
}

pub(super) const CHATS_CHANNEL: &str =
	"id_grindr_notifications_channel_individual_v2";
pub(super) const TAPS_CHANNEL: &str = "id_grindr_notifications_channel_tap_v2";
pub(super) const CONVERSATION_DEEPLINK: &str = "grindr://conversation?id=";
pub(super) const TAPS_DEEPLINK: &str = "grindr://taps-inbox";
pub(super) const CLEAR_DEEPLINK: &str = "grindr://clear?conversationId=";
pub(super) const UNSEND_DEEPLINK: &str = "grindr://unsend?notificationId=";
const CATCH_UP_LINE: &str = "unread";
const BLOCKED: &str = "urn:gr:err:unauthorized_action";
pub(super) const MESSAGE_PAGES: usize = 3;
pub(super) const MESSAGE_LINES: usize = 8;

pub fn line_key(conversation: &str, line: &str) -> String {
	format!("poll:{conversation}:{line}")
}

pub fn messages_path(conversation: &str) -> String {
	format!("/v5/chat/conversation/{conversation}/message?profile=false")
}

fn blocked(status: u16, answer: &Value) -> bool {
	status == 403 && answer["type"].as_str() == Some(BLOCKED)
}

fn cleared(conversation: &str) -> Push {
	Push::from([
		("version", "2".to_owned()),
		("action", format!("{CLEAR_DEEPLINK}{conversation}")),
	])
}

fn conversations<'a>(
	inbox: Option<&'a Inbox>,
	me: Option<&'a str>,
) -> impl Iterator<Item = Conversation<'a>> {
	inbox
		.into_iter()
		.flat_map(|inbox| &inbox.entries)
		.filter_map(move |data| Conversation::parse(data, me))
}

pub fn pages_wanted(
	inbox: Option<&Inbox>,
	since: i64,
	me: Option<&str>,
) -> Vec<String> {
	conversations(inbox, me)
		.filter(|conversation| conversation.wants_page(since))
		.map(|conversation| conversation.id.to_owned())
		.take(MESSAGE_PAGES)
		.collect()
}

pub fn poll(
	inbox: Option<&Inbox>,
	pages: &Pages,
	taps: Option<&Value>,
	since: Watermarks,
	me: Option<&str>,
) -> Poll {
	let mut poll = Poll::unchanged(since);
	for conversation in conversations(inbox, me) {
		let page = pages.get(conversation.id);
		if let Some(pushes) = conversation.messages(since.inbox, page) {
			poll.watermarks.inbox = poll.watermarks.inbox.max(conversation.at);
			poll.pushes.extend(pushes);
		}
		poll.pushes.extend(conversation.read_elsewhere());
	}
	let taps = taps.and_then(|taps| taps["profiles"].as_array());
	for profile in taps.into_iter().flatten() {
		if let Some((at, push)) = tap(profile, since.taps) {
			poll.watermarks.taps = poll.watermarks.taps.max(at);
			poll.pushes.push(push);
		}
	}
	poll
}

fn profile_id(value: &Value) -> Option<String> {
	value
		.as_i64()
		.map(|id| id.to_string())
		.or_else(|| value.as_str().map(str::to_owned))
		.filter(|id| !id.is_empty())
}

fn tap(profile: &Value, since: i64) -> Option<(i64, Push)> {
	let at = profile["timestamp"].as_i64()?;
	let id = profile_id(&profile["profileId"])?;
	if at <= since {
		return None;
	}
	let mut push = base(at, format!("poll:tap:{id}"), TAPS_CHANNEL);
	push.insert("action", TAPS_DEEPLINK.to_owned());
	push.insert("senderId", id);
	set_body_key(&mut push, TAP_BODY);
	if let Some(name) = profile["displayName"]
		.as_str()
		.filter(|name| !name.is_empty())
	{
		push.insert("title", name.to_owned());
	}
	Some((at, push))
}

fn base(at: i64, notification_id: String, channel: &str) -> Push {
	Push::from([
		("version", "2".to_owned()),
		("notificationId", notification_id),
		("channel", channel.to_owned()),
		("timestamp", at.to_string()),
	])
}
