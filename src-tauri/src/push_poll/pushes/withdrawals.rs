#[cfg(test)]
mod tests;

use std::collections::HashSet;

use serde::Deserialize;
use serde_json::Value;

use super::{
	blocked, cleared, line_key, messages_path, Answer, Push, CATCH_UP_LINE,
	UNSEND_DEEPLINK,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShownConversation {
	pub conversation_id: String,
	pub keys: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub struct Check {
	pub path: String,
	pub body: Option<Value>,
}

impl ShownConversation {
	pub fn check(&self) -> Check {
		let ids = self.message_ids();
		if ids.is_empty() {
			return Check {
				path: messages_path(&self.conversation_id),
				body: None,
			};
		}
		Check {
			path: format!(
				"/v4/chat/conversation/{}/message-by-id",
				self.conversation_id
			),
			body: Some(serde_json::json!({ "messageIds": ids })),
		}
	}

	pub fn message_ids(&self) -> Vec<&str> {
		let prefix = line_key(&self.conversation_id, "");
		self.keys
			.iter()
			.filter_map(|key| key.strip_prefix(prefix.as_str()))
			.filter(|line| {
				*line != CATCH_UP_LINE && line.parse::<i64>().is_err()
			})
			.collect()
	}

	pub fn answered_by(&self, (status, page): &Answer) -> bool {
		if blocked(*status, page) {
			return true;
		}
		let Some(messages) = page["messages"].as_array() else {
			return false;
		};
		let returned: HashSet<&str> = messages
			.iter()
			.filter_map(|message| message["messageId"].as_str())
			.collect();
		(200..300).contains(status)
			&& self.message_ids().iter().all(|id| returned.contains(id))
	}

	pub fn withdrawals(&self, (status, answer): &Answer) -> Vec<Push> {
		if blocked(*status, answer) {
			return vec![cleared(&self.conversation_id)];
		}
		if !(200..300).contains(status) {
			return Vec::new();
		}
		let Some(messages) = answer["messages"].as_array() else {
			return Vec::new();
		};
		let kept: HashSet<&str> = messages
			.iter()
			.filter(|message| message["unsent"].as_bool() != Some(true))
			.filter_map(|message| message["messageId"].as_str())
			.collect();
		self.message_ids()
			.into_iter()
			.filter(|id| !kept.contains(id))
			.map(|id| unsend(&line_key(&self.conversation_id, id)))
			.collect()
	}
}

fn unsend(key: &str) -> Push {
	Push::from([
		("version", "2".to_owned()),
		("action", format!("{UNSEND_DEEPLINK}{}", query_value(key))),
	])
}

fn query_value(value: &str) -> String {
	value
		.bytes()
		.map(|byte| match byte {
			b'A'..=b'Z'
			| b'a'..=b'z'
			| b'0'..=b'9'
			| b'-'
			| b'.'
			| b'_'
			| b'~'
			| b':' => char::from(byte).to_string(),
			_ => format!("%{byte:02X}"),
		})
		.collect()
}
