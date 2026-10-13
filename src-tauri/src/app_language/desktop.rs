use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
use super::apple as platform;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use super::linux as platform;
#[cfg(target_os = "windows")]
use super::windows as platform;
use super::CHANGED_EVENT;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncTier {
	#[cfg_attr(not(test), allow(dead_code))]
	TwoWay,
	None,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AppLanguages {
	pub tier: SyncTier,
	pub app: Option<String>,
	pub system: Vec<String>,
}

impl AppLanguages {
	pub fn unsynced(system: Vec<String>) -> Self {
		Self {
			tier: SyncTier::None,
			app: None,
			system,
		}
	}
}

#[derive(Default)]
pub struct LastRead(Mutex<Option<AppLanguages>>);

impl LastRead {
	fn replace(&self, languages: &AppLanguages) -> bool {
		let mut last = self.0.lock().unwrap();
		if last.as_ref() == Some(languages) {
			return false;
		}
		*last = Some(languages.clone());
		true
	}
}

pub fn current(app: &AppHandle) -> AppLanguages {
	let languages = platform::read();
	app.state::<LastRead>().replace(&languages);
	languages
}

pub fn set(app: &AppHandle, tag: Option<&str>) -> Result<(), String> {
	platform::write(tag)?;
	current(app);
	Ok(())
}

fn refresh(app: &AppHandle) {
	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		let languages = platform::read();
		if app.state::<LastRead>().replace(&languages) {
			let _ = app.emit(CHANGED_EVENT, &languages);
		}
	});
}

pub fn refresh_on_focus(window: &tauri::WebviewWindow) {
	if window.label() != crate::MAIN_WINDOW_LABEL {
		return;
	}
	let app = window.app_handle().clone();
	window.on_window_event(move |event| {
		if matches!(event, tauri::WindowEvent::Focused(true)) {
			refresh(&app);
		}
	});
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_languages_serialize_as_the_frontend_reads_them() {
		let synced = AppLanguages {
			tier: SyncTier::TwoWay,
			app: Some("es-419".into()),
			system: vec!["de-AT".into(), "en-US".into()],
		};
		assert_eq!(
			serde_json::to_value(&synced).unwrap(),
			serde_json::json!({
				"tier": "two-way",
				"app": "es-419",
				"system": ["de-AT", "en-US"],
			})
		);
		assert_eq!(
			serde_json::to_value(AppLanguages::unsynced(Vec::new())).unwrap(),
			serde_json::json!({ "tier": "none", "app": null, "system": [] })
		);
	}

	#[test]
	fn the_frontend_reads_every_tier() {
		const SYNC: &str =
			include_str!("../../../src/lib/platform/language-sync.ts");
		let tiers = SYNC
			.split_once("LANGUAGE_SYNC_TIERS = [")
			.and_then(|(_, rest)| rest.split_once(']'))
			.expect("language-sync.ts no longer declares LANGUAGE_SYNC_TIERS")
			.0;
		for tier in [SyncTier::TwoWay, SyncTier::None] {
			let name = serde_json::to_string(&tier).unwrap();
			assert!(
				tiers.contains(&name),
				"language-sync.ts does not list {name}, so the app reads every report as tier none"
			);
		}
	}

	#[test]
	fn only_a_changed_read_counts_as_new() {
		let last = LastRead::default();
		let german = AppLanguages::unsynced(vec!["de-DE".into()]);
		let chosen = AppLanguages {
			tier: SyncTier::TwoWay,
			app: Some("de".into()),
			system: vec!["de-DE".into()],
		};
		assert!(last.replace(&german));
		assert!(!last.replace(&german.clone()));
		assert!(last.replace(&chosen));
		assert!(last.replace(&german));
	}
}
