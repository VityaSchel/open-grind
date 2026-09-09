//! An AppImage cannot register itself with the desktop, so the app offers to write its own entry.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const ENTRY_FILE: &str = "open-grind.desktop";
const WM_CLASS: &str = "open-grind";

#[derive(Debug, Serialize)]
pub struct DesktopEntryError(String);

impl From<std::io::Error> for DesktopEntryError {
	fn from(error: std::io::Error) -> Self {
		Self(error.to_string())
	}
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

fn integration_suppressed() -> bool {
	if std::env::var_os("DESKTOPINTEGRATION").is_some_and(|v| !v.is_empty()) {
		return true;
	}
	let markers = [
		data_home().map(|d| d.join("appimagekit/no_desktopintegration")),
		Some(PathBuf::from(
			"/usr/share/appimagekit/no_desktopintegration",
		)),
		Some(PathBuf::from("/etc/appimagekit/no_desktopintegration")),
	];
	markers.into_iter().flatten().any(|marker| marker.exists())
		|| appimaged_running()
}

fn appimaged_running() -> bool {
	fs::read_dir("/proc").is_ok_and(|entries| {
		entries.filter_map(Result::ok).any(|entry| {
			fs::read_to_string(entry.path().join("comm"))
				.is_ok_and(|comm| comm.trim() == "appimaged")
		})
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

fn icon_name(entry: &str) -> Option<&str> {
	entry
		.lines()
		.find_map(|line| line.strip_prefix("Icon="))
		.map(str::trim)
		.filter(|name| !name.is_empty())
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopEntryState {
	pub available: bool,
	pub installed: bool,
}

#[tauri::command]
pub fn desktop_entry_state() -> DesktopEntryState {
	DesktopEntryState {
		available: appimage().is_some() && !integration_suppressed(),
		installed: entry_path().is_some_and(|entry| entry.exists()),
	}
}

#[tauri::command]
pub fn desktop_entry_install() -> Result<(), DesktopEntryError> {
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
pub fn desktop_entry_remove() -> Result<(), DesktopEntryError> {
	let entry =
		entry_path().ok_or_else(|| DesktopEntryError("no data home".into()))?;
	let installed = fs::read_to_string(&entry).unwrap_or_default();
	if let (Some(icon), Some(data)) = (icon_name(&installed), data_home()) {
		remove_icons(&data, icon)?;
	}
	match fs::remove_file(&entry) {
		Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
			Err(error.into())
		}
		_ => Ok(()),
	}
}

fn remove_icons(data: &Path, icon: &str) -> Result<(), DesktopEntryError> {
	let hicolor = data.join("icons/hicolor");
	let Ok(sizes) = fs::read_dir(&hicolor) else {
		return Ok(());
	};
	for size in sizes.filter_map(Result::ok) {
		let file = size.path().join("apps").join(format!("{icon}.png"));
		if let Err(error) = fs::remove_file(&file) {
			if error.kind() != std::io::ErrorKind::NotFound {
				return Err(error.into());
			}
		}
	}
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
	fn the_icon_to_clean_up_comes_from_the_entry_being_removed() {
		assert_eq!(icon_name(ENTRY), Some("open-grind"));
	}

	#[test]
	fn an_entry_without_an_icon_leaves_icons_alone() {
		assert_eq!(icon_name("[Desktop Entry]\nExec=x"), None);
		assert_eq!(icon_name("[Desktop Entry]\nIcon=  "), None);
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
