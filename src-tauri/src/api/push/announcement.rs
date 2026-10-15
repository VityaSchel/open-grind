use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
	Messages,
	Taps,
}

#[cfg_attr(target_os = "android", allow(dead_code))]
impl Category {
	pub(super) const ALL: [Self; 2] = [Self::Messages, Self::Taps];

	pub(super) fn name(self) -> &'static str {
		match self {
			Self::Messages => "messages",
			Self::Taps => "taps",
		}
	}

	pub(super) fn named(name: &str) -> Option<Self> {
		Self::ALL
			.into_iter()
			.find(|category| category.name() == name)
	}
}

#[cfg_attr(target_os = "android", allow(dead_code))]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Announcement {
	pub(super) category: Category,
	pub(super) tag: String,
	pub(super) message_id: Option<String>,
	pub(super) title: String,
	pub(super) body: String,
	pub(super) deeplink: String,
}
