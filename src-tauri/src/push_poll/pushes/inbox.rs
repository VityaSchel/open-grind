use std::collections::HashSet;

use serde_json::Value;

pub(super) const INBOX_PAGES: u32 = 5;

#[derive(Debug, Default)]
pub struct Inbox {
	pub(super) entries: Vec<Value>,
	conversations: HashSet<String>,
	pages: u32,
}

impl Inbox {
	pub fn read(&mut self, page: &Value, watermark: i64) -> Option<u32> {
		self.pages += 1;
		for data in entries(page).map(|entry| &entry["data"]) {
			let Some(id) = data["conversationId"].as_str() else {
				continue;
			};
			if self.conversations.insert(id.to_owned()) {
				self.entries.push(data.clone());
			}
		}
		if !continues(page, watermark) || self.pages >= INBOX_PAGES {
			return None;
		}
		Some(self.pages + 1)
	}
}

fn entries(page: &Value) -> impl Iterator<Item = &Value> {
	page["entries"].as_array().into_iter().flatten()
}

fn oldest_activity(page: &Value) -> Option<i64> {
	entries(page)
		.filter_map(|entry| entry["data"]["lastActivityTimestamp"].as_i64())
		.min()
}

pub(super) fn continues(page: &Value, watermark: i64) -> bool {
	page["nextPage"].is_number()
		&& oldest_activity(page).is_some_and(|oldest| oldest > watermark)
}
