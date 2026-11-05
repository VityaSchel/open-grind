use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;

use objc2::rc::Retained;
use objc2::{AllocAnyThread, MainThreadMarker};
use objc2_app_kit::{
	NSApplication, NSImage, NSWorkspace, NSWorkspaceIconCreationOptions,
};
use objc2_foundation::{NSData, NSString};
use tauri::{AppHandle, WebviewWindow};

use super::{icon, DisguiseError, Preset};

const CUSTOM_ICON_FILE: &str = "Icon\r";

fn image(preset: &Preset) -> Option<Retained<NSImage>> {
	NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(icon(preset)))
}

fn bundle() -> Option<PathBuf> {
	std::env::current_exe()
		.ok()?
		.ancestors()
		.find(|dir| dir.extension().is_some_and(|kind| kind == "app"))
		.map(Path::to_path_buf)
}

fn set_bundle_icon(
	bundle: &Path,
	chosen: Option<&Preset>,
) -> Result<(), DisguiseError> {
	let image = chosen.and_then(image);
	let applied = NSWorkspace::sharedWorkspace().setIcon_forFile_options(
		image.as_deref(),
		&NSString::from_str(&bundle.to_string_lossy()),
		NSWorkspaceIconCreationOptions::empty(),
	);
	if applied {
		Ok(())
	} else {
		Err(DisguiseError::new("macOS refused to change the app icon"))
	}
}

fn set_dock_icon(app: &AppHandle, chosen: Option<&'static Preset>) {
	let _ = app.run_on_main_thread(move || {
		let Some(main_thread) = MainThreadMarker::new() else {
			return;
		};
		let image = chosen.and_then(image);
		unsafe {
			NSApplication::sharedApplication(main_thread)
				.setApplicationIconImage(image.as_deref());
		}
	});
}

fn bundle_name(app: &AppHandle, chosen: Option<&Preset>) -> String {
	let name = chosen.map_or_else(
		|| app.package_info().name.clone(),
		|preset| preset.name.clone(),
	);
	format!("{}.app", name.replace(['/', ':'], "-"))
}

fn rename_bundle(
	bundle: &Path,
	name: &str,
) -> Result<Option<PathBuf>, DisguiseError> {
	let target = bundle.with_file_name(name);
	if target == bundle {
		return Ok(None);
	}
	if target.exists() {
		return Err(DisguiseError::new(format!(
			"An app named {name} is already in this folder"
		)));
	}
	match std::fs::rename(bundle, &target) {
		Ok(()) => Ok(Some(target)),
		Err(error) if error.kind() == ErrorKind::PermissionDenied => {
			Err(DisguiseError::new(
				"The icon changed, but renaming the app needs an administrator",
			))
		}
		Err(error) => Err(error.into()),
	}
}

fn relaunch_after_exit(bundle: &Path) {
	let _ = Command::new("/bin/sh")
		.arg("-c")
		.arg("while kill -0 \"$1\" 2>/dev/null; do sleep 0.1; done; exec /usr/bin/open -n \"$2\"")
		.arg("open-grind-relaunch")
		.arg(std::process::id().to_string())
		.arg(bundle)
		.spawn();
}

pub(super) fn apply(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	let Some(bundle) = bundle() else {
		return Ok(());
	};
	set_bundle_icon(&bundle, chosen)?;
	if let Some(renamed) = rename_bundle(&bundle, &bundle_name(app, chosen))? {
		relaunch_after_exit(&renamed);
		app.exit(0);
	}
	Ok(())
}

pub(super) fn reapply(
	_app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	let Some(bundle) = bundle() else {
		return Ok(());
	};
	if bundle.join(CUSTOM_ICON_FILE).exists() == chosen.is_some() {
		return Ok(());
	}
	set_bundle_icon(&bundle, chosen)
}

pub(super) fn decorate(
	app: &AppHandle,
	_window: &WebviewWindow,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	set_dock_icon(app, chosen);
	Ok(())
}
