#[cfg(test)]
mod tests;

use std::cmp::Reverse;

use serde_json::Value;

use super::conversation::Conversation;
use super::{blocked, profile_id, Answer, MESSAGE_LINES};

const RETRACT: &str = "Retract";

pub(super) enum Page<'a> {
	Unreadable,
	Blocked,
	Messages(Vec<&'a Value>),
}

pub(super) fn read<'a>(
	(status, page): &'a Answer,
	conversation: &Conversation,
	since: i64,
) -> Page<'a> {
	if blocked(*status, page) {
		return Page::Blocked;
	}
	if !(200..300).contains(status) {
		return Page::Unreadable;
	}
	let (Some(messages), Some(peer), Some(preview)) = (
		page["messages"].as_array(),
		conversation.peer.as_deref(),
		conversation.preview_id(),
	) else {
		return Page::Unreadable;
	};
	let mut newest_first: Vec<&Value> = messages
		.iter()
		.filter(|message| message["timestamp"].is_i64())
		.collect();
	newest_first.sort_by_key(|message| Reverse(message["timestamp"].as_i64()));
	let Some(snapshot) = newest_first
		.iter()
		.position(|message| message["messageId"].as_str() == Some(preview))
	else {
		return Page::Unreadable;
	};
	let limit = usize::try_from(conversation.unread())
		.unwrap_or_default()
		.min(MESSAGE_LINES);
	let mut lines: Vec<&Value> = newest_first[snapshot..]
		.iter()
		.take_while(|message| message["timestamp"].as_i64() > Some(since))
		.filter(|message| announced(message, peer))
		.take(limit)
		.copied()
		.collect();
	lines.reverse();
	Page::Messages(lines)
}

fn announced(message: &Value, peer: &str) -> bool {
	message["messageId"]
		.as_str()
		.is_some_and(|id| !id.is_empty())
		&& profile_id(&message["senderId"]).as_deref() == Some(peer)
		&& message["unsent"].as_bool() != Some(true)
		&& message["type"].as_str() != Some(RETRACT)
}
