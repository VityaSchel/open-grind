//! An AppImage cannot register itself with the desktop, so the app offers to write its own entry.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SCHEMA: u32 = 1;
const LEDGER_FILE: &str = "desktop-entry.json";
const ENTRY_FILE: &str = "open-grind.desktop";
const WM_CLASS: &str = "open-grind";

#[derive(Debug, Serialize)]
pub struct DesktopEntryError(String);

macro_rules! from_error {
	($($error:ty),+) => {$(
		impl From<$error> for DesktopEntryError {
			fn from(error: $error) -> Self {
				Self(error.to_string())
			}
		}
	)+};
}
from_error!(std::io::Error, serde_json::Error, tauri::Error);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Ledger {
	schema: u32,
	dismissed: bool,
}

fn ledger_path(app: &AppHandle) -> Result<PathBuf, DesktopEntryError> {
	let dir = app.path().app_local_data_dir()?;
	fs::create_dir_all(&dir)?;
	Ok(dir.join(LEDGER_FILE))
}

fn dismissed(app: &AppHandle) -> bool {
	ledger_path(app)
		.ok()
		.and_then(|path| fs::read(path).ok())
		.and_then(|raw| serde_json::from_slice::<Ledger>(&raw).ok())
		.is_some_and(|ledger| ledger.schema == SCHEMA && ledger.dismissed)
}

fn appimage() -> Option<PathBuf> {
	std::env::var_os("APPIMAGE").map(PathBuf::from)
}

fn appdir() -> Option<PathBuf> {
	std::env::var_os("APPDIR").map(PathBuf::from)
}

fn data_home() -> Option<PathBuf> {
	std::env::var_os("XDG_DATA_HOME")
		.map(PathBuf::from)
		.filter(|path| path.is_absolute())
		.or_else(|| {
			std::env::var_os("HOME")
				.map(|home| PathBuf::from(home).join(".local/share"))
		})
}

fn entry_path() -> Option<PathBuf> {
	data_home().map(|data| data.join("applications").join(ENTRY_FILE))
}

fn bundled_entry(appdir: &Path) -> Option<PathBuf> {
	fs::read_dir(appdir.join("usr/share/applications"))
		.ok()?
		.filter_map(Result::ok)
		.map(|entry| entry.path())
		.find(|path| path.extension().is_some_and(|ext| ext == "desktop"))
}

fn rewrite_exec(line: &str, appimage: &Path) -> String {
	let target = appimage.display();
	match line.strip_prefix("Exec=").and_then(|v| v.split_once(' ')) {
		Some((_, arguments)) => format!("Exec=\"{target}\" {arguments}"),
		None => format!("Exec=\"{target}\""),
	}
}

fn rewrite_entry(source: &str, appimage: &Path) -> String {
	let mut lines: Vec<String> = source
		.lines()
		.map(|line| {
			if line.starts_with("Exec=") {
				rewrite_exec(line, appimage)
			} else {
				line.to_owned()
			}
		})
		.collect();
	if !lines.iter().any(|line| line.starts_with("StartupWMClass=")) {
		lines.push(format!("StartupWMClass={WM_CLASS}"));
	}
	lines.join("\n") + "\n"
}

fn copy_icons(appdir: &Path, data: &Path) -> Result<(), DesktopEntryError> {
	let hicolor = appdir.join("usr/share/icons/hicolor");
	let Ok(sizes) = fs::read_dir(&hicolor) else {
		return Ok(());
	};
	for size in sizes.filter_map(Result::ok) {
		let apps = size.path().join("apps");
		let Ok(icons) = fs::read_dir(&apps) else {
			continue;
		};
		let target = data
			.join("icons/hicolor")
			.join(size.file_name())
			.join("apps");
		fs::create_dir_all(&target)?;
		for icon in icons.filter_map(Result::ok) {
			fs::copy(icon.path(), target.join(icon.file_name()))?;
		}
	}
	Ok(())
}

#[tauri::command]
pub fn desktop_entry_offer(app: AppHandle) -> bool {
	let Some(entry) = entry_path() else {
		return false;
	};
	appimage().is_some() && !entry.exists() && !dismissed(&app)
}

#[tauri::command]
pub fn desktop_entry_install(_app: AppHandle) -> Result<(), DesktopEntryError> {
	let appimage = appimage()
		.ok_or_else(|| DesktopEntryError("not an AppImage".into()))?;
	let appdir =
		appdir().ok_or_else(|| DesktopEntryError("no APPDIR".into()))?;
	let data =
		data_home().ok_or_else(|| DesktopEntryError("no data home".into()))?;
	let source = bundled_entry(&appdir)
		.ok_or_else(|| DesktopEntryError("no bundled entry".into()))?;
	let entry =
		entry_path().ok_or_else(|| DesktopEntryError("no data home".into()))?;

	copy_icons(&appdir, &data)?;
	if let Some(parent) = entry.parent() {
		fs::create_dir_all(parent)?;
	}
	fs::write(
		&entry,
		rewrite_entry(&fs::read_to_string(source)?, &appimage),
	)?;
	Ok(())
}

#[tauri::command]
pub fn desktop_entry_dismiss(app: AppHandle) -> Result<(), DesktopEntryError> {
	let ledger = Ledger {
		schema: SCHEMA,
		dismissed: true,
	};
	fs::write(ledger_path(&app)?, serde_json::to_vec(&ledger)?)?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Verbatim from the published v0.1.0-beta.4.1 .deb.
	const ENTRY: &str = "[Desktop Entry]\nCategories=Network;\nComment=Unofficial FLOSS Grindr client\nExec=open-grind\nStartupWMClass=open-grind\nIcon=open-grind\nName=Open Grind\nTerminal=false\nType=Application";

	#[test]
	fn exec_points_at_the_appimage_rather_than_a_binary_on_the_path() {
		let rewritten =
			rewrite_entry(ENTRY, Path::new("/home/a/Apps/Open Grind.AppImage"));

		assert!(
			rewritten.contains("Exec=\"/home/a/Apps/Open Grind.AppImage\"\n")
		);
		assert!(!rewritten.contains("Exec=open-grind"));
	}

	#[test]
	fn field_codes_survive_an_entry_that_carries_them() {
		let rewritten =
			rewrite_entry("Exec=open-grind %U", Path::new("/a.AppImage"));

		assert!(rewritten.contains("Exec=\"/a.AppImage\" %U"));
	}

	#[test]
	fn an_exec_without_arguments_still_gets_quoted() {
		let rewritten =
			rewrite_exec("Exec=open-grind", Path::new("/a b/c.AppImage"));

		assert_eq!(rewritten, "Exec=\"/a b/c.AppImage\"");
	}

	#[test]
	fn wm_class_is_added_when_the_entry_lacks_one() {
		let rewritten =
			rewrite_entry("[Desktop Entry]\nExec=x", Path::new("/a.AppImage"));

		assert!(rewritten.contains("StartupWMClass=open-grind"));
	}

	#[test]
	fn the_wm_class_the_deb_already_ships_is_not_duplicated() {
		let rewritten = rewrite_entry(ENTRY, Path::new("/a.AppImage"));

		assert_eq!(rewritten.matches("StartupWMClass=").count(), 1);
	}

	#[test]
	fn the_rest_of_the_entry_survives_untouched() {
		let rewritten = rewrite_entry(ENTRY, Path::new("/a.AppImage"));

		assert!(rewritten.starts_with("[Desktop Entry]\n"));
		assert!(rewritten.contains("Name=Open Grind"));
		assert!(rewritten.contains("Icon=open-grind"));
		assert!(rewritten.contains("Categories=Network;"));
		assert!(rewritten.contains("Terminal=false"));
	}
}
