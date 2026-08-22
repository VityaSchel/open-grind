use std::fs;
use std::path::{Path, PathBuf};

use crate::api::update::error::UpdateError;

pub fn install(payload: &Path) -> Result<(), UpdateError> {
	swap(&std::env::current_exe()?, payload)
}

pub fn sweep_replaced() {
	if let Ok(current) = std::env::current_exe() {
		let _ = fs::remove_file(sibling(&current, ".old"));
	}
}

fn swap(current: &Path, payload: &Path) -> Result<(), UpdateError> {
	let staged = sibling(current, ".new");
	let replaced = sibling(current, ".old");
	fs::copy(payload, &staged)?;
	if let Err(error) = make_executable(&staged) {
		let _ = fs::remove_file(&staged);
		return Err(error);
	}

	let _ = fs::remove_file(&replaced);
	if cfg!(windows) {
		if let Err(error) = fs::rename(current, &replaced) {
			let _ = fs::remove_file(&staged);
			return Err(error.into());
		}
	}
	if let Err(error) = fs::rename(&staged, current) {
		let _ = fs::remove_file(&staged);
		let _ = fs::rename(&replaced, current);
		return Err(error.into());
	}
	Ok(())
}

fn sibling(current: &Path, extension: &str) -> PathBuf {
	let mut name = current.file_name().unwrap_or_default().to_os_string();
	name.push(extension);
	current.with_file_name(name)
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), UpdateError> {
	use std::os::unix::fs::PermissionsExt;

	Ok(fs::set_permissions(
		path,
		fs::Permissions::from_mode(0o755),
	)?)
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), UpdateError> {
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn scratch(name: &str) -> PathBuf {
		let dir = std::env::temp_dir()
			.join(format!("og-swap-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&dir);
		fs::create_dir_all(&dir).unwrap();
		dir
	}

	#[test]
	fn swapping_replaces_the_file_in_place_and_leaves_nothing_behind() {
		let dir = scratch("ok");
		let current = dir.join("app");
		let payload = dir.join("payload");
		fs::write(&current, b"old").unwrap();
		fs::write(&payload, b"new").unwrap();

		swap(&current, &payload).unwrap();

		assert_eq!(fs::read(&current).unwrap(), b"new");
		assert!(!sibling(&current, ".new").exists());
		let _ = fs::remove_dir_all(dir);
	}

	#[test]
	fn a_missing_payload_leaves_the_running_executable_untouched() {
		let dir = scratch("missing");
		let current = dir.join("app");
		fs::write(&current, b"old").unwrap();

		swap(&current, &dir.join("absent")).unwrap_err();

		assert_eq!(fs::read(&current).unwrap(), b"old");
		assert!(!sibling(&current, ".new").exists());
		let _ = fs::remove_dir_all(dir);
	}

	#[cfg(unix)]
	#[test]
	fn the_replacement_is_executable_even_when_the_download_was_not() {
		use std::os::unix::fs::PermissionsExt;

		let dir = scratch("mode");
		let current = dir.join("app");
		let payload = dir.join("payload");
		fs::write(&current, b"old").unwrap();
		fs::write(&payload, b"new").unwrap();
		fs::set_permissions(&payload, fs::Permissions::from_mode(0o644))
			.unwrap();

		swap(&current, &payload).unwrap();

		let mode = fs::metadata(&current).unwrap().permissions().mode();
		assert_eq!(mode & 0o111, 0o111, "{mode:o} is not executable");
		let _ = fs::remove_dir_all(dir);
	}

	#[test]
	fn staging_sits_next_to_the_executable_so_the_rename_stays_atomic() {
		let current = Path::new("/opt/open-grind/open-grind");
		assert_eq!(
			sibling(current, ".new"),
			Path::new("/opt/open-grind/open-grind.new")
		);
	}
}
