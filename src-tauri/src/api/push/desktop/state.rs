use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::super::{Announcement, Category, PushCategory, PushSignal};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
struct Categories {
	messages: bool,
	taps: bool,
}

impl Default for Categories {
	fn default() -> Self {
		Self {
			messages: true,
			taps: true,
		}
	}
}

impl Categories {
	fn of(self, category: Category) -> bool {
		match category {
			Category::Messages => self.messages,
			Category::Taps => self.taps,
		}
	}

	fn with(self, category: Category, enabled: bool) -> Self {
		match category {
			Category::Messages => Self {
				messages: enabled,
				..self
			},
			Category::Taps => Self {
				taps: enabled,
				..self
			},
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Shown {
	deeplink: String,
	message_id: Option<String>,
}

pub struct DesktopPush {
	enabled: AtomicBool,
	categories_file: PathBuf,
	categories: Mutex<Categories>,
	shown: Mutex<HashMap<String, Shown>>,
	deeplink: Mutex<Option<String>>,
	watcher: Mutex<Option<Channel<PushSignal>>>,
}

impl DesktopPush {
	pub fn load(categories_file: PathBuf) -> Self {
		let categories = fs::read(&categories_file)
			.ok()
			.and_then(|bytes| serde_json::from_slice(&bytes).ok())
			.unwrap_or_default();
		Self {
			enabled: AtomicBool::new(false),
			categories_file,
			categories: Mutex::new(categories),
			shown: Mutex::new(HashMap::new()),
			deeplink: Mutex::new(None),
			watcher: Mutex::new(None),
		}
	}

	pub fn enabled(&self) -> bool {
		self.enabled.load(Ordering::SeqCst)
	}

	pub fn set_enabled(&self, enabled: bool) -> Vec<String> {
		self.enabled.store(enabled, Ordering::SeqCst);
		if enabled {
			return Vec::new();
		}
		self.shown
			.lock()
			.unwrap()
			.drain()
			.map(|(tag, _)| tag)
			.collect()
	}

	pub fn categories(&self) -> Vec<PushCategory> {
		let categories = *self.categories.lock().unwrap();
		Category::ALL
			.into_iter()
			.map(|category| PushCategory {
				category: category.name().to_owned(),
				enabled: categories.of(category),
				system_blocked: false,
			})
			.collect()
	}

	pub fn set_category(
		&self,
		category: Category,
		enabled: bool,
	) -> std::io::Result<()> {
		let mut categories = self.categories.lock().unwrap();
		let changed = categories.with(category, enabled);
		if let Some(directory) = self.categories_file.parent() {
			fs::create_dir_all(directory)?;
		}
		fs::write(&self.categories_file, serde_json::to_vec(&changed)?)?;
		*categories = changed;
		Ok(())
	}

	pub fn admits(&self, announcement: &Announcement) -> bool {
		self.enabled()
			&& self.categories.lock().unwrap().of(announcement.category)
	}

	pub fn record(&self, announcement: &Announcement) {
		self.shown.lock().unwrap().insert(
			announcement.tag.clone(),
			Shown {
				deeplink: announcement.deeplink.clone(),
				message_id: announcement.message_id.clone(),
			},
		);
	}

	pub fn shown_tags(&self) -> Vec<String> {
		self.shown.lock().unwrap().keys().cloned().collect()
	}

	pub fn withdraw(&self, tag: &str, message_id: Option<&str>) -> bool {
		let mut shown = self.shown.lock().unwrap();
		let showing_it = shown.get(tag).is_some_and(|shown| {
			message_id.is_none() || shown.message_id.as_deref() == message_id
		});
		if showing_it {
			shown.remove(tag);
		}
		showing_it
	}

	pub fn open(&self, tag: &str, carried: Option<String>) -> bool {
		let shown = self.shown.lock().unwrap().remove(tag);
		let Some(deeplink) = carried.or(shown.map(|shown| shown.deeplink))
		else {
			return false;
		};
		*self.deeplink.lock().unwrap() = Some(deeplink);
		if let Some(watcher) = self.watcher.lock().unwrap().as_ref() {
			let _ = watcher.send(PushSignal {
				deeplink_pending: true,
				token_changed: false,
			});
		}
		true
	}

	pub fn take_deeplink(&self) -> Option<String> {
		self.deeplink.lock().unwrap().take()
	}

	pub fn deeplink_pending(&self) -> bool {
		self.deeplink.lock().unwrap().is_some()
	}

	pub fn watch(&self, watcher: Channel<PushSignal>) {
		*self.watcher.lock().unwrap() = Some(watcher);
	}
}

#[cfg(test)]
mod tests;
