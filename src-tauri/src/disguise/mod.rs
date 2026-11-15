use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Wry};

#[cfg(target_os = "android")]
mod android;
#[cfg(desktop)]
pub(crate) mod desktop;
mod icons {
	include!(concat!(env!("OUT_DIR"), "/disguise_icons.rs"));
}
#[cfg(target_os = "linux")]
pub(crate) mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub(crate) const ORIGINAL: &str = "original";

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct Preset {
	pub id: String,
	pub name: String,
}

static PRESETS: LazyLock<Vec<Preset>> = LazyLock::new(|| {
	serde_json::from_str(include_str!("presets.json"))
		.expect("presets.json lists every disguise")
});

pub(crate) fn preset(id: &str) -> Option<&'static Preset> {
	PRESETS.iter().find(|preset| preset.id == id)
}

#[cfg(desktop)]
pub(crate) fn icon(preset: &Preset) -> &'static [u8] {
	icons::ICONS
		.iter()
		.find(|(id, _)| *id == preset.id)
		.map(|(_, bytes)| *bytes)
		.expect("build.rs renders an icon for every preset")
}

#[tauri::command]
pub fn disguise_previews() -> HashMap<&'static str, String> {
	icons::PREVIEWS
		.iter()
		.map(|(id, png)| {
			(
				*id,
				format!("data:image/png;base64,{}", STANDARD.encode(png)),
			)
		})
		.collect()
}

#[derive(Debug, Serialize)]
pub struct DisguiseError(pub(crate) String);

impl DisguiseError {
	pub(crate) fn new(message: impl Into<String>) -> Self {
		Self(message.into())
	}
}

impl From<std::io::Error> for DisguiseError {
	fn from(error: std::io::Error) -> Self {
		Self(error.to_string())
	}
}

impl From<tauri::Error> for DisguiseError {
	fn from(error: tauri::Error) -> Self {
		Self(error.to_string())
	}
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisguiseState {
	available: bool,
	current: String,
	presets: &'static [Preset],
	rename_needs_admin: bool,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("disguise")
		.setup(|_app, _api| {
			#[cfg(target_os = "android")]
			android::register(_app, &_api)?;
			Ok(())
		})
		.build()
}

#[tauri::command]
pub async fn disguise_state(
	app: AppHandle,
) -> Result<DisguiseState, DisguiseError> {
	#[cfg(target_os = "android")]
	let (available, current) = (true, android::current(&app).await?);
	#[cfg(desktop)]
	let (available, current) = (true, desktop::current(&app));
	#[cfg(target_os = "ios")]
	let (available, current) = {
		let _ = &app;
		(false, ORIGINAL.to_owned())
	};
	#[cfg(target_os = "macos")]
	let rename_needs_admin = macos::rename_needs_admin();
	#[cfg(any(
		target_os = "android",
		target_os = "ios",
		target_os = "linux",
		target_os = "windows"
	))]
	let rename_needs_admin = false;
	Ok(DisguiseState {
		available,
		current,
		presets: &PRESETS,
		rename_needs_admin,
	})
}

const RESUME_FILE: &str = "disguise-resume";
const RESUME_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Resume {
	path: String,
	saved_at: u64,
}

fn resume_file(app: &AppHandle) -> tauri::Result<PathBuf> {
	Ok(crate::app_data::data_dir(app)?.join(RESUME_FILE))
}

fn unix_now() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |elapsed| elapsed.as_secs())
}

fn save_resume(app: &AppHandle, path: String) -> Result<(), DisguiseError> {
	let file = resume_file(app)?;
	if let Some(parent) = file.parent() {
		fs::create_dir_all(parent)?;
	}
	let resume = Resume {
		path,
		saved_at: unix_now(),
	};
	let bytes = serde_json::to_vec(&resume)
		.map_err(|error| DisguiseError::new(error.to_string()))?;
	fs::write(file, bytes)?;
	Ok(())
}

fn forget_resume(app: &AppHandle) {
	if let Ok(file) = resume_file(app) {
		let _ = fs::remove_file(file);
	}
}

fn fresh_resume(saved: &[u8], now: u64) -> Option<String> {
	let resume: Resume = serde_json::from_slice(saved).ok()?;
	let age = now.checked_sub(resume.saved_at)?;
	(age <= RESUME_WINDOW.as_secs()).then_some(resume.path)
}

#[tauri::command]
pub fn disguise_take_resume(app: AppHandle) -> Option<String> {
	let file = resume_file(&app).ok()?;
	let saved = fs::read(&file).ok()?;
	let _ = fs::remove_file(&file);
	fresh_resume(&saved, unix_now())
}

#[tauri::command]
pub async fn disguise_select(
	app: AppHandle,
	id: String,
	resume: Option<String>,
) -> Result<(), DisguiseError> {
	if id != ORIGINAL && preset(&id).is_none() {
		return Err(DisguiseError::new(format!("unknown disguise {id}")));
	}
	if let Some(path) = resume {
		save_resume(&app, path)?;
	}
	#[cfg(target_os = "android")]
	let selected = android::select(&app, &id).await;
	#[cfg(desktop)]
	let selected = desktop::select(&app, &id);
	#[cfg(target_os = "ios")]
	let selected =
		Err(DisguiseError::new("disguises are not available on iOS yet"));
	if selected.is_err() {
		forget_resume(&app);
	}
	selected
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn every_preset_id_is_unique_and_safe_for_android_and_file_names() {
		let mut ids = std::collections::HashSet::new();
		for preset in PRESETS.iter() {
			assert!(ids.insert(preset.id.as_str()), "{} repeats", preset.id);
			assert_ne!(preset.id, ORIGINAL);
			assert!(
				preset.id.chars().all(|c| c.is_ascii_lowercase()
					|| c.is_ascii_digit()
					|| c == '-'),
				"{}",
				preset.id
			);
			assert!(!preset.name.trim().is_empty());
		}
	}

	#[cfg(desktop)]
	#[test]
	fn every_preset_has_exactly_one_icon_for_this_platform() {
		assert_eq!(icons::ICONS.len(), PRESETS.len());
		for preset in PRESETS.iter() {
			assert!(!icon(preset).is_empty(), "{}", preset.id);
		}
	}

	fn saved(path: &str, saved_at: u64) -> Vec<u8> {
		serde_json::to_vec(&Resume {
			path: path.to_owned(),
			saved_at,
		})
		.unwrap()
	}

	#[test]
	fn a_restart_reopens_the_screen_it_left() {
		let page = "/settings/app/discreet-icon";
		assert_eq!(
			fresh_resume(&saved(page, 1_000), 1_000).as_deref(),
			Some(page)
		);
		assert_eq!(
			fresh_resume(&saved(page, 1_000), 1_060).as_deref(),
			Some(page)
		);
	}

	#[test]
	fn a_resume_left_behind_by_a_failed_restart_expires() {
		let page = "/settings/app/discreet-icon";
		assert_eq!(fresh_resume(&saved(page, 1_000), 1_061), None);
		assert_eq!(fresh_resume(&saved(page, 1_000), 999), None);
		assert_eq!(fresh_resume(b"not json", 1_000), None);
	}

	#[test]
	fn the_picker_gets_a_png_preview_for_every_choice() {
		let previews = disguise_previews();
		assert_eq!(previews.len(), PRESETS.len() + 1);
		for id in PRESETS
			.iter()
			.map(|preset| preset.id.as_str())
			.chain([ORIGINAL])
		{
			assert!(
				previews[id].starts_with("data:image/png;base64,iVBORw0KGgo"),
				"{id}"
			);
		}
	}
}
