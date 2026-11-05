use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Wry};

#[cfg(target_os = "android")]
mod android;
#[cfg(desktop)]
pub(crate) mod desktop;
#[cfg(desktop)]
mod icons;
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
		.expect("every preset has an icon; run bun run gen:disguise-icons")
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
	let current = android::current(&app).await?;
	#[cfg(desktop)]
	let current = desktop::current(&app);
	#[cfg(any(target_os = "android", desktop))]
	return Ok(DisguiseState {
		available: true,
		current,
		presets: &PRESETS,
	});
	#[cfg(target_os = "ios")]
	{
		let _ = &app;
		Ok(DisguiseState {
			available: false,
			current: ORIGINAL.to_owned(),
			presets: &PRESETS,
		})
	}
}

#[tauri::command]
pub async fn disguise_select(
	app: AppHandle,
	id: String,
) -> Result<(), DisguiseError> {
	if id != ORIGINAL && preset(&id).is_none() {
		return Err(DisguiseError::new(format!("unknown disguise {id}")));
	}
	#[cfg(target_os = "android")]
	return android::select(&app, &id).await;
	#[cfg(desktop)]
	return desktop::select(&app, &id);
	#[cfg(target_os = "ios")]
	{
		let _ = &app;
		Err(DisguiseError::new("disguises are not available on iOS yet"))
	}
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
}
