#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod binary;
#[cfg(target_os = "macos")]
mod bundle;
#[cfg(target_os = "windows")]
mod installer;
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
	#[cfg(target_os = "windows")]
	installer::install(payload)?;
	#[cfg(not(any(target_os = "macos", target_os = "windows")))]
	binary::install(payload)?;

	if let Ok(marker) = marker(app) {
		let _ = fs::write(marker, app.package_info().version.to_string());
	}

	#[cfg(target_os = "macos")]
	{
		bundle::relaunch_after_exit();
		app.exit(0);
		Ok(())
	}
	// The installer kills this process, replaces it and relaunches it itself.
	#[cfg(target_os = "windows")]
	{
		Ok(())
	}
	#[cfg(not(any(target_os = "macos", target_os = "windows")))]
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
	#[cfg(not(any(target_os = "macos", target_os = "windows")))]
	binary::sweep_replaced();
}

pub fn enforce_home() {
	#[cfg(target_os = "macos")]
	location::enforce();
}

pub fn take_outcome(app: &AppHandle) -> Option<Outcome> {
	let marker = marker(app).ok()?;
	let replaced = fs::read_to_string(&marker).unwrap_or_default();
	fs::remove_file(marker).ok()?;
	Some(outcome_of(
		replaced.trim(),
		&app.package_info().version.to_string(),
	))
}

// The installer runs after this process is gone, so the only evidence it worked
// is that the version it was asked to replace is no longer the one running.
fn outcome_of(replaced: &str, current: &str) -> Outcome {
	let succeeded = replaced != current;
	Outcome {
		succeeded,
		canceled: false,
		code: None,
		message: (!succeeded)
			.then(|| format!("still running {current} after the install")),
	}
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
		.app_local_data_dir()
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
	fn an_unchanged_version_after_the_install_is_a_failure() {
		assert!(outcome_of("0.1.0", "0.2.0").succeeded);
		assert!(!outcome_of("0.2.0", "0.2.0").succeeded);
		assert!(outcome_of("", "0.2.0").succeeded);
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
