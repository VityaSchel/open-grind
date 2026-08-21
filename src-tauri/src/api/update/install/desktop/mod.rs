#[cfg(not(target_os = "macos"))]
mod binary;
#[cfg(target_os = "macos")]
mod bundle;
#[cfg(target_os = "macos")]
mod location;

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::super::error::UpdateError;
use super::{Capability, Outcome, Unsupported};

const INSTALLED_MARKER: &str = "update-installed";

fn target() -> String {
	format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

pub fn reason() -> Unsupported {
	if let Some(runtime) = sandbox() {
		return Unsupported::Sandboxed {
			runtime: runtime.to_owned(),
		};
	}
	Unsupported::NoReleaseArtifacts { target: target() }
}

pub fn capability(_app: &AppHandle) -> Capability {
	if sandbox().is_some() {
		return Capability::Unsupported(reason());
	}
	match super::release_asset_suffix().filter(|_| installable()) {
		Some(payload_suffix) => Capability::Supported {
			payload_suffix,
			can_install_now: true,
		},
		None => Capability::Unsupported(reason()),
	}
}

pub async fn install(
	app: &AppHandle,
	payload: &Path,
) -> Result<(), UpdateError> {
	#[cfg(target_os = "macos")]
	bundle::install(payload)?;
	#[cfg(not(target_os = "macos"))]
	binary::install(payload)?;

	if let Ok(marker) = marker(app) {
		let _ = fs::write(marker, []);
	}

	#[cfg(target_os = "macos")]
	{
		bundle::relaunch_after_exit();
		app.exit(0);
		Ok(())
	}
	#[cfg(not(target_os = "macos"))]
	app.restart()
}

pub fn hold_process<R: tauri::Runtime>(_app: &AppHandle<R>, _active: bool) {}

pub fn watch_install(
	_app: &AppHandle,
	_on_event: tauri::ipc::Channel<Outcome>,
) -> Result<(), UpdateError> {
	Ok(())
}

pub fn open_install_permission_settings(
	_app: &AppHandle,
) -> Result<(), UpdateError> {
	Err(UpdateError::Unsupported(reason()))
}

pub fn sweep_replaced() {
	#[cfg(not(target_os = "macos"))]
	binary::sweep_replaced();
}

pub fn enforce_home() {
	#[cfg(target_os = "macos")]
	location::enforce();
}

pub fn take_outcome(app: &AppHandle) -> Option<Outcome> {
	let marker = marker(app).ok()?;
	fs::remove_file(marker).ok()?;
	Some(Outcome {
		succeeded: true,
		canceled: false,
		code: None,
		message: None,
	})
}

fn installable() -> bool {
	match std::env::consts::OS {
		"windows" => true,
		"macos" => std::env::current_exe()
			.ok()
			.and_then(|exe| enclosing_bundle(&exe))
			.is_some(),
		_ => false,
	}
}

pub fn enclosing_bundle(exe: &Path) -> Option<PathBuf> {
	exe.ancestors()
		.find(|dir| dir.extension().is_some_and(|kind| kind == "app"))
		.map(Path::to_path_buf)
}

fn marker(app: &AppHandle) -> Result<PathBuf, UpdateError> {
	let dir = app
		.path()
		.app_data_dir()
		.map_err(|e| UpdateError::Storage(e.to_string()))?;
	fs::create_dir_all(&dir)?;
	Ok(dir.join(INSTALLED_MARKER))
}

fn sandbox() -> Option<&'static str> {
	if !cfg!(target_os = "linux") {
		return None;
	}
	if std::env::var_os("FLATPAK_ID").is_some() {
		return Some("Flatpak");
	}
	if std::env::var_os("SNAP").is_some() {
		return Some("Snap");
	}
	None
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn an_executable_inside_a_bundle_reports_the_bundle_root() {
		let exe =
			Path::new("/Applications/Open Grind.app/Contents/MacOS/open-grind");
		assert_eq!(
			enclosing_bundle(exe).unwrap(),
			Path::new("/Applications/Open Grind.app")
		);
		assert!(enclosing_bundle(Path::new("/usr/local/bin/og")).is_none());
	}

	#[test]
	fn every_installable_platform_ships_an_artifact_it_can_apply() {
		let suffix = super::super::release_asset_suffix().unwrap_or_default();
		if !installable() {
			return;
		}
		assert!(
			suffix.ends_with(".exe") || suffix.ends_with(".zip"),
			"{suffix} cannot be applied by any desktop installer"
		);
	}
}
