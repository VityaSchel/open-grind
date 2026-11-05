use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(target_os = "linux")]
use super::linux as platform;
#[cfg(target_os = "macos")]
use super::macos as platform;
#[cfg(target_os = "windows")]
use super::windows as platform;
use super::{preset, DisguiseError, Preset, ORIGINAL};

const STATE_FILE: &str = "disguise";

fn state_path(app: &AppHandle) -> tauri::Result<PathBuf> {
	Ok(crate::app_data::data_dir(app)?.join(STATE_FILE))
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
pub(crate) fn icons_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
	Ok(crate::app_data::data_dir(app)?.join("disguise-icons"))
}

pub(crate) fn active(app: &AppHandle) -> Option<&'static Preset> {
	let id = fs::read_to_string(state_path(app).ok()?).ok()?;
	preset(id.trim())
}

#[cfg(target_os = "linux")]
pub(crate) fn display_name(app: &AppHandle) -> String {
	active(app).map_or_else(
		|| app.package_info().name.clone(),
		|preset| preset.name.clone(),
	)
}

pub(super) fn current(app: &AppHandle) -> String {
	active(app)
		.map_or(ORIGINAL, |preset| preset.id.as_str())
		.to_owned()
}

fn persist(
	app: &AppHandle,
	preset: Option<&Preset>,
) -> Result<(), DisguiseError> {
	let path = state_path(app)?;
	match preset {
		Some(preset) => {
			if let Some(parent) = path.parent() {
				fs::create_dir_all(parent)?;
			}
			fs::write(&path, &preset.id)?;
		}
		None => match fs::remove_file(&path) {
			Err(error) if error.kind() != ErrorKind::NotFound => {
				return Err(error.into());
			}
			_ => {}
		},
	}
	Ok(())
}

pub(super) fn select(app: &AppHandle, id: &str) -> Result<(), DisguiseError> {
	let chosen = preset(id);
	persist(app, chosen)?;
	if let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) {
		decorate(app, &window, chosen);
	}
	platform::apply(app, chosen)
}

pub(crate) fn restore(app: &AppHandle, window: &WebviewWindow) {
	let chosen = active(app);
	decorate(app, window, chosen);
	if let Err(error) = platform::reapply(app, chosen) {
		tracing::warn!(
			"[disguise] could not restore {:?}: {}",
			chosen.map(|p| &p.id),
			error.0
		);
	}
}

fn decorate(
	app: &AppHandle,
	window: &WebviewWindow,
	chosen: Option<&'static Preset>,
) {
	let title = chosen.map_or_else(
		|| app.package_info().name.clone(),
		|preset| preset.name.clone(),
	);
	if let Err(error) = window.set_title(&title) {
		tracing::warn!("[disguise] could not set the window title: {error}");
	}
	if let Err(error) = platform::decorate(app, window, chosen) {
		tracing::warn!("[disguise] could not set the window icon: {}", error.0);
	}
}
