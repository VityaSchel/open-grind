use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use gtk::prelude::{BinExt, Cast, GtkWindowExt, HeaderBarExt};
use gtk::{EventBox, HeaderBar};
use tauri::image::Image;
use tauri::{AppHandle, WebviewWindow};

use super::desktop::{active, icons_dir, window_title};
use super::{icon, DisguiseError, Preset};
use crate::desktop_entry::{data_home, DesktopEntryError, ORIGINAL_ICON_KEY};

const MARKER_KEY: &str = "X-OpenGrind-Disguise";
const DROPPED_KEYS: [&str; 5] = [
	"Name[",
	"GenericName",
	"Comment",
	"Keywords",
	"X-OpenGrind-",
];

impl From<DesktopEntryError> for DisguiseError {
	fn from(error: DesktopEntryError) -> Self {
		Self(error.0)
	}
}

fn data_dirs() -> Vec<PathBuf> {
	std::env::var("XDG_DATA_DIRS")
		.ok()
		.filter(|dirs| !dirs.is_empty())
		.unwrap_or_else(|| "/usr/local/share:/usr/share".into())
		.split(':')
		.map(PathBuf::from)
		.filter(|dir| dir.is_absolute())
		.collect()
}

fn write_icon(
	app: &AppHandle,
	chosen: Option<&Preset>,
) -> Result<Option<PathBuf>, DisguiseError> {
	let dir = icons_dir(app)?;
	let target = chosen.map(|preset| dir.join(format!("{}.png", preset.id)));
	if let Ok(entries) = fs::read_dir(&dir) {
		for entry in entries.filter_map(Result::ok) {
			if Some(entry.path()) != target {
				fs::remove_file(entry.path())?;
			}
		}
	}
	let (Some(preset), Some(target)) = (chosen, &target) else {
		return Ok(None);
	};
	if !target.exists() {
		fs::create_dir_all(&dir)?;
		fs::write(target, icon(preset))?;
	}
	Ok(Some(target.clone()))
}

fn disguise_entry(source: &str, preset: &Preset, icon: &Path) -> String {
	let mut original_icon = None;
	let mut lines = Vec::new();
	for line in source.lines() {
		if let Some(value) = line.strip_prefix("Icon=") {
			original_icon = Some(value.trim().to_owned());
			lines.push(format!("Icon={}", icon.display()));
		} else if line.starts_with("Name=") {
			lines.push(format!("Name={}", preset.name));
		} else if !DROPPED_KEYS.iter().any(|key| line.starts_with(key)) {
			lines.push(line.to_owned());
		}
	}
	let mut keys = vec![format!("{MARKER_KEY}={}", preset.id)];
	if let Some(original_icon) = original_icon {
		keys.push(format!("{ORIGINAL_ICON_KEY}{original_icon}"));
	}
	let header = lines
		.iter()
		.position(|line| line.trim() == "[Desktop Entry]")
		.map_or(0, |index| index + 1);
	lines.splice(header..header, keys);
	lines.join("\n") + "\n"
}

fn with_try_exec(entry: String) -> String {
	if entry.lines().any(|line| line.starts_with("TryExec=")) {
		return entry;
	}
	let program = entry.lines().find_map(|line| {
		let command = line.strip_prefix("Exec=")?.trim();
		let program = match command.strip_prefix('"') {
			Some(quoted) => quoted.split('"').next()?,
			None => command.split_whitespace().next()?,
		};
		(!program.is_empty()).then(|| program.to_owned())
	});
	match program {
		Some(program) => entry.replacen(
			"[Desktop Entry]\n",
			&format!("[Desktop Entry]\nTryExec={program}\n"),
			1,
		),
		None => entry,
	}
}

pub(crate) fn disguised_entry(
	app: &AppHandle,
	entry: String,
) -> Result<String, DisguiseError> {
	let chosen = active(app);
	match (chosen, write_icon(app, chosen)?) {
		(Some(preset), Some(icon)) => Ok(disguise_entry(&entry, preset, &icon)),
		_ => Ok(entry),
	}
}

fn system_entry_name(app: &AppHandle) -> String {
	format!("{}.desktop", app.package_info().name)
}

fn system_entry(app: &AppHandle) -> Option<PathBuf> {
	let name = system_entry_name(app);
	data_dirs()
		.into_iter()
		.map(|dir| dir.join("applications").join(&name))
		.find(|path| path.is_file())
}

fn user_override(app: &AppHandle) -> Option<PathBuf> {
	Some(
		data_home()?
			.join("applications")
			.join(system_entry_name(app)),
	)
}

fn is_ours(path: &Path) -> bool {
	fs::read_to_string(path).is_ok_and(|entry| {
		entry.lines().any(|line| line.starts_with(MARKER_KEY))
	})
}

fn remove_override(app: &AppHandle) -> Result<(), DisguiseError> {
	let Some(path) = user_override(app) else {
		return Ok(());
	};
	if !is_ours(&path) {
		return Ok(());
	}
	match fs::remove_file(&path) {
		Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
		_ => Ok(()),
	}
}

fn write_override(app: &AppHandle) -> Result<(), DisguiseError> {
	let (Some(source), Some(target)) = (system_entry(app), user_override(app))
	else {
		return Ok(());
	};
	if target.exists() && !is_ours(&target) {
		return Ok(());
	}
	let entry = disguised_entry(app, fs::read_to_string(source)?)?;
	if let Some(parent) = target.parent() {
		fs::create_dir_all(parent)?;
	}
	fs::write(target, with_try_exec(entry))?;
	Ok(())
}

pub(super) fn apply(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	if crate::appimage::path().is_some() {
		if crate::desktop_entry::installed() {
			crate::desktop_entry::install(app)?;
		} else {
			write_icon(app, chosen)?;
		}
		return Ok(());
	}
	match chosen {
		Some(_) => write_override(app),
		None => {
			write_icon(app, None)?;
			remove_override(app)
		}
	}
}

pub(super) fn reapply(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	match (chosen, crate::appimage::path()) {
		(Some(_), _) => apply(app, chosen),
		(None, Some(_)) => Ok(()),
		(None, None) => remove_override(app),
	}
}

fn set_header_bar_title(
	window: &WebviewWindow,
	title: String,
) -> Result<(), DisguiseError> {
	let target = window.clone();
	window.run_on_main_thread(move || {
		let Ok(window) = target.gtk_window() else {
			return;
		};
		let Some(titlebar) = window.titlebar() else {
			return;
		};
		let header = match titlebar.downcast::<HeaderBar>() {
			Ok(header) => Some(header),
			Err(wrapper) => wrapper
				.downcast::<EventBox>()
				.ok()
				.and_then(|wrapper| wrapper.child())
				.and_then(|child| child.downcast::<HeaderBar>().ok()),
		};
		if let Some(header) = header {
			header.set_title(Some(&title));
		}
	})?;
	Ok(())
}

pub(super) fn decorate(
	app: &AppHandle,
	window: &WebviewWindow,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	set_header_bar_title(window, window_title(app, chosen))?;
	let image = match chosen {
		Some(preset) => {
			let decoded = image::load_from_memory(icon(preset))
				.map_err(|error| DisguiseError::new(error.to_string()))?
				.into_rgba8();
			let (width, height) = decoded.dimensions();
			Image::new_owned(decoded.into_raw(), width, height)
		}
		None => match app.default_window_icon() {
			Some(icon) => icon.clone().to_owned(),
			None => return Ok(()),
		},
	};
	window.set_icon(image)?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	const ENTRY: &str = "[Desktop Entry]\nCategories=Network;\nComment=Unofficial FLOSS Grindr client\nExec=open-grind\nStartupWMClass=open-grind\nIcon=open-grind\nName=Open Grind\nTerminal=false\nType=Application\n";

	fn preset() -> Preset {
		Preset {
			id: "hook-app".into(),
			name: "Hook App".into(),
		}
	}

	#[test]
	fn the_disguise_replaces_the_name_and_icon_and_drops_the_description() {
		let entry =
			disguise_entry(ENTRY, &preset(), Path::new("/data/hook-app.png"));
		assert!(entry.contains("\nName=Hook App\n"));
		assert!(entry.contains("\nIcon=/data/hook-app.png\n"));
		assert!(!entry.contains("Comment="));
		assert!(!entry.contains("Grindr"));
		assert!(entry.contains("\nExec=open-grind\n"));
	}

	#[test]
	fn the_marker_and_original_icon_sit_inside_the_entry_group() {
		let entry =
			disguise_entry(ENTRY, &preset(), Path::new("/data/hook-app.png"));
		assert!(entry.starts_with(&format!(
			"[Desktop Entry]\n{MARKER_KEY}=hook-app\n{ORIGINAL_ICON_KEY}open-grind\n"
		)));
	}

	#[test]
	fn try_exec_names_the_program_so_the_override_hides_after_uninstall() {
		assert!(with_try_exec(ENTRY.into())
			.starts_with("[Desktop Entry]\nTryExec=open-grind\n"));
		let quoted = ENTRY.replace(
			"Exec=open-grind",
			"Exec=\"/opt/Open Grind/open-grind\" %u",
		);
		assert!(with_try_exec(quoted).starts_with(
			"[Desktop Entry]\nTryExec=/opt/Open Grind/open-grind\n"
		));
	}
}
