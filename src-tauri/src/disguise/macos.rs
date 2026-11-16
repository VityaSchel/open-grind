use std::io::ErrorKind;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use objc2::rc::Retained;
use objc2::{AllocAnyThread, MainThreadMarker};
use objc2_app_kit::{
	NSApplication, NSImage, NSWorkspace, NSWorkspaceIconCreationOptions,
};
use objc2_foundation::{NSData, NSFileManager, NSString};
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
		return Err(DisguiseError::NameTaken);
	}
	match std::fs::rename(bundle, &target) {
		Ok(()) => Ok(Some(target)),
		Err(error) if error.kind() == ErrorKind::PermissionDenied => {
			Err(DisguiseError::RenameNeedsAdmin)
		}
		Err(error) => Err(error.into()),
	}
}

fn renamable(bundle: &Path) -> bool {
	bundle.parent().is_some_and(|folder| {
		NSFileManager::defaultManager().isWritableFileAtPath(
			&NSString::from_str(&folder.to_string_lossy()),
		)
	})
}

pub(super) fn rename_needs_admin() -> bool {
	bundle().is_some_and(|bundle| !renamable(&bundle))
}

fn relaunch_after_exit(bundle: &Path) {
	let _ = Command::new("/bin/sh")
		.arg("-c")
		.arg("while kill -0 \"$1\" 2>/dev/null; do sleep 0.1; done; sleep 0.5; exec /usr/bin/open \"$2\"")
		.arg("open-grind-relaunch")
		.arg(std::process::id().to_string())
		.arg(bundle)
		.process_group(0)
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
	if !renamable(&bundle) {
		return Ok(());
	}
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

#[cfg(test)]
mod tests {
	use super::*;

	struct Folder(PathBuf);

	impl Folder {
		fn with_apps(test: &str, apps: &[&str]) -> Self {
			let path = std::env::temp_dir()
				.join(format!("open-grind-{test}-{}", std::process::id()));
			for app in apps {
				std::fs::create_dir_all(path.join(app)).unwrap();
			}
			Self(path)
		}

		fn set_mode(&self, mode: u32) {
			use std::os::unix::fs::PermissionsExt;
			std::fs::set_permissions(
				&self.0,
				std::fs::Permissions::from_mode(mode),
			)
			.unwrap();
		}
	}

	impl Drop for Folder {
		fn drop(&mut self) {
			self.set_mode(0o755);
			let _ = std::fs::remove_dir_all(&self.0);
		}
	}

	#[test]
	fn only_a_writable_folder_lets_the_app_rename_itself() {
		assert!(!renamable(Path::new("/System/Applications/Calculator.app")));
		assert!(renamable(&std::env::temp_dir().join("Open Grind.app")));
	}

	#[test]
	fn renaming_onto_another_app_reports_the_name_as_taken() {
		let folder =
			Folder::with_apps("name-taken", &["Open Grind.app", "Papizza.app"]);

		assert_eq!(
			rename_bundle(&folder.0.join("Open Grind.app"), "Papizza.app"),
			Err(DisguiseError::NameTaken)
		);
		assert!(folder.0.join("Open Grind.app").exists());
	}

	#[test]
	fn renaming_in_a_folder_the_user_cannot_write_needs_an_administrator() {
		let folder = Folder::with_apps("needs-admin", &["Open Grind.app"]);
		folder.set_mode(0o555);

		assert_eq!(
			rename_bundle(&folder.0.join("Open Grind.app"), "Papizza.app"),
			Err(DisguiseError::RenameNeedsAdmin)
		);
	}
}
