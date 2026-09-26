use serde_json::Value;

pub struct MessageQuery<'a> {
	pub sender: u64,
	pub text: Option<&'a str>,
	pub kind: Option<&'a str>,
	pub since_ms: u64,
}

impl MessageQuery<'_> {
	fn matches(&self, message: &Value) -> bool {
		message["senderId"].as_u64() == Some(self.sender)
			&& message["timestamp"].as_u64().unwrap_or(0) >= self.since_ms
			&& self
				.kind
				.is_none_or(|kind| message["type"].as_str() == Some(kind))
			&& self.text.is_none_or(|text| {
				message["body"]["text"].as_str() == Some(text)
			})
	}
}

pub fn find_matching_message<'a>(
	conversation: &'a Value,
	query: &MessageQuery<'_>,
) -> Option<&'a Value> {
	conversation["messages"]
		.as_array()?
		.iter()
		.find(|message| query.matches(message))
}

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;

	fn conversation() -> Value {
		json!({ "messages": [
			{ "messageId": "a", "senderId": 858049792, "timestamp": 2000,
				"type": "Text", "body": { "text": "og-e2e 1" } },
			{ "messageId": "b", "senderId": 858049792, "timestamp": 3000,
				"type": "Image", "body": { "mediaId": 5 } },
			{ "messageId": "c", "senderId": 880215879, "timestamp": 4000,
				"type": "Text", "body": { "text": "og-e2e 2" } },
		] })
	}

	fn query<'a>() -> MessageQuery<'a> {
		MessageQuery {
			sender: 858_049_792,
			text: None,
			kind: None,
			since_ms: 0,
		}
	}

	#[test]
	fn finds_a_text_from_the_sender() {
		let conversation = conversation();
		let found = find_matching_message(
			&conversation,
			&MessageQuery {
				text: Some("og-e2e 1"),
				..query()
			},
		);
		assert_eq!(found.unwrap()["messageId"], "a");
	}

	#[test]
	fn ignores_the_same_text_from_someone_else() {
		let conversation = conversation();
		let found = find_matching_message(
			&conversation,
			&MessageQuery {
				text: Some("og-e2e 2"),
				..query()
			},
		);
		assert!(found.is_none());
	}

	#[test]
	fn finds_a_message_type_sent_after_a_moment() {
		let conversation = conversation();
		let found = find_matching_message(
			&conversation,
			&MessageQuery {
				kind: Some("Image"),
				since_ms: 2500,
				..query()
			},
		);
		assert_eq!(found.unwrap()["messageId"], "b");
	}

	#[test]
	fn ignores_messages_older_than_the_moment() {
		let conversation = conversation();
		let found = find_matching_message(
			&conversation,
			&MessageQuery {
				text: Some("og-e2e 1"),
				since_ms: 2500,
				..query()
			},
		);
		assert!(found.is_none());
	}
}
