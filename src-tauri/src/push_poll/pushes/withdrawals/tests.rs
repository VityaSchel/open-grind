use serde_json::json;

use super::*;
use crate::push_poll::pushes::CLEAR_DEEPLINK;

const CONVERSATION: &str = "111:222";

fn shown(keys: &[&str]) -> ShownConversation {
	ShownConversation {
		conversation_id: CONVERSATION.to_owned(),
		keys: keys.iter().map(|key| (*key).to_owned()).collect(),
	}
}

fn unsent_keys(pushes: &[Push]) -> Vec<String> {
	pushes
		.iter()
		.map(|push| {
			push["action"]
				.strip_prefix(UNSEND_DEEPLINK)
				.expect("a withdrawal is an unsend link")
				.to_owned()
		})
		.collect()
}

#[test]
fn only_lines_the_poll_posted_with_a_message_id_are_checked() {
	let card = shown(&[
		"poll:111:222:2000:c0ffee",
		"poll:111:222:unread",
		"poll:111:222:1790202179623",
		"poll:111:333:3000:beef",
		"8a1f-fcm-notification",
	]);

	assert_eq!(card.message_ids(), ["2000:c0ffee"]);
}

#[test]
fn an_unsent_message_is_withdrawn_under_the_key_it_was_posted_with() {
	let card = shown(&["poll:111:222:2000:c0ffee", "poll:111:222:3000:beef"]);
	let answer = json!({ "messages": [
		{ "messageId": "2000:c0ffee", "unsent": true },
		{ "messageId": "3000:beef", "unsent": false },
	] });

	assert_eq!(
		unsent_keys(&card.withdrawals(200, &answer)),
		["poll:111:222:2000:c0ffee"]
	);
}

#[test]
fn a_message_grindr_no_longer_returns_is_withdrawn() {
	let card = shown(&["poll:111:222:2000:c0ffee", "poll:111:222:3000:beef"]);
	let answer =
		json!({ "messages": [{ "messageId": "3000:beef", "unsent": false }] });

	assert_eq!(
		unsent_keys(&card.withdrawals(200, &answer)),
		["poll:111:222:2000:c0ffee"]
	);
}

#[test]
fn an_answer_without_messages_withdraws_nothing() {
	let card = shown(&["poll:111:222:2000:c0ffee"]);

	assert!(card.withdrawals(200, &json!({})).is_empty());
	assert!(card
		.withdrawals(200, &json!({ "messages": null }))
		.is_empty());
}

#[test]
fn a_withdrawal_is_a_v2_unsend_with_its_key_escaped_for_a_query() {
	let pushes = shown(&["poll:111:222:1 &=%"])
		.withdrawals(200, &json!({ "messages": [] }));

	assert_eq!(pushes.len(), 1);
	assert_eq!(pushes[0]["version"], "2");
	assert_eq!(unsent_keys(&pushes), ["poll:111:222:1%20%26%3D%25"]);
}

#[test]
fn a_conversation_grindr_refuses_after_a_block_is_cleared_whole() {
	let card = shown(&["poll:111:222:2000:c0ffee", "8a1f-fcm-notification"]);
	let refused =
		json!({ "type": "urn:gr:err:unauthorized_action", "status": 403 });

	let pushes = card.withdrawals(403, &refused);

	assert_eq!(pushes.len(), 1);
	assert_eq!(pushes[0]["version"], "2");
	assert_eq!(pushes[0]["action"], format!("{CLEAR_DEEPLINK}111:222"));
}

#[test]
fn any_other_failure_withdraws_nothing() {
	let card = shown(&["poll:111:222:2000:c0ffee"]);

	assert!(card
		.withdrawals(403, &json!({ "type": "urn:gr:err:forbidden" }))
		.is_empty());
	assert!(card.withdrawals(500, &json!({ "messages": [] })).is_empty());
	assert!(card.withdrawals(404, &Value::Null).is_empty());
}

#[test]
fn a_card_with_message_lines_asks_for_exactly_those_messages() {
	let check =
		shown(&["poll:111:222:2000:c0ffee", "poll:111:222:unread"]).check();

	assert_eq!(
		check,
		Check {
			path: "/v4/chat/conversation/111:222/message-by-id".to_owned(),
			body: Some(json!({ "messageIds": ["2000:c0ffee"] })),
		}
	);
}

#[test]
fn a_card_without_message_lines_still_learns_whether_the_chat_was_blocked() {
	let card = shown(&["poll:111:222:unread"]);

	assert_eq!(
		card.check(),
		Check {
			path: "/v5/chat/conversation/111:222/message".to_owned(),
			body: None,
		}
	);
	let refused = json!({ "type": "urn:gr:err:unauthorized_action" });
	assert_eq!(card.withdrawals(403, &refused).len(), 1);
	assert!(card
		.withdrawals(
			200,
			&json!({ "messages": [{ "messageId": "1:x", "unsent": true }] })
		)
		.is_empty());
}
