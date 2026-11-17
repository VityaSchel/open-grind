use std::sync::Mutex;

use serde::{Deserialize, Serialize};
#[cfg(desktop)]
use tauri::Emitter;
use tauri::{AppHandle, Manager};

#[cfg(any(target_os = "macos", target_os = "ios"))]
use super::apple as platform;
#[cfg(all(desktop, not(any(target_os = "macos", target_os = "windows"))))]
use super::linux as platform;
#[cfg(target_os = "windows")]
use super::windows as platform;
#[cfg(desktop)]
use super::CHANGED_EVENT;
use crate::native_strings::NativeStrings;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncTier {
	#[cfg_attr(
		not(any(target_os = "macos", target_os = "ios", test)),
		allow(dead_code)
	)]
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

#[derive(Default)]
pub struct ShownLanguage(Mutex<Option<String>>);

#[derive(Deserialize)]
struct StoredLanguage {
	#[serde(default)]
	language: Option<String>,
}

fn stored_language(preferences: &[u8]) -> Option<String> {
	rmp_serde::from_slice::<StoredLanguage>(preferences)
		.ok()?
		.language
}

fn languages_before_the_interface(stored: Option<String>) -> Vec<String> {
	let languages = platform::read();
	stored
		.into_iter()
		.chain(languages.app)
		.chain(languages.system)
		.collect()
}

#[cfg(target_os = "macos")]
pub fn native_strings_before_launch() -> NativeStrings {
	NativeStrings::pick(languages_before_the_interface(None))
}

pub fn native_strings(app: &AppHandle) -> NativeStrings {
	let shown = app.state::<ShownLanguage>().0.lock().unwrap().clone();
	match shown {
		Some(tag) => NativeStrings::pick([tag]),
		None => NativeStrings::pick(languages_before_the_interface(
			crate::app_data::read_preferences(app)
				.as_deref()
				.and_then(stored_language),
		)),
	}
}

pub fn set_native(app: &AppHandle, tag: Option<String>) {
	*app.state::<ShownLanguage>().0.lock().unwrap() = tag;
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

#[cfg(desktop)]
fn refresh(app: &AppHandle) {
	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		let languages = platform::read();
		if app.state::<LastRead>().replace(&languages) {
			let _ = app.emit(CHANGED_EVENT, &languages);
		}
	});
}

#[cfg(desktop)]
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
	fn the_stored_choice_is_read_from_the_preferences_the_app_writes() {
		let preferences = rmp_serde::to_vec(&serde_json::json!({
			"autoUpdateLocation": false,
			"backdropBlurCalibration": null,
			"gridSearchFilters": { "ageMin": 18, "tribes": [1, 2] },
			"language": "es-MX",
			"languageSync": { "native": null },
			"units": "metric",
		}))
		.unwrap();
		assert_eq!(stored_language(&preferences).as_deref(), Some("es-MX"));
		let following = rmp_serde::to_vec(&serde_json::json!({
			"language": null,
			"units": "imperial",
		}))
		.unwrap();
		assert_eq!(stored_language(&following), None);
		let older =
			rmp_serde::to_vec(&serde_json::json!({ "units": "metric" }))
				.unwrap();
		assert_eq!(stored_language(&older), None);
		assert_eq!(stored_language(b"not msgpack"), None);
	}

	#[test]
	fn the_preferences_still_store_the_choice_where_native_code_reads_it() {
		const PREFERENCES: &str =
			include_str!("../../../src/lib/app-data/preferences.svelte.ts");
		const APP_DATA: &str =
			include_str!("../../../src/lib/app-data/index.ts");
		assert!(
			PREFERENCES.contains("\tlanguage: languageTagSchema")
				&& PREFERENCES.contains("path: \"preferences.data\",\n\t\tcontent: encode(preferences),"),
			"preferences.svelte.ts no longer writes the language choice as a msgpack field of preferences.data, so native text misses the choice"
		);
		assert!(
			APP_DATA.contains("\"preferences.data\": \"preferences\""),
			"app-data/index.ts no longer stores preferences.data as the native preferences file"
		);
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
