use std::ffi::{c_char, c_int, c_uint, CString};
use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::api::update::error::UpdateError;

const RENAME_SWAP: c_uint = 0x0000_0002;

extern "C" {
	fn renamex_np(
		from: *const c_char,
		to: *const c_char,
		flags: c_uint,
	) -> c_int;
}

pub fn install(payload: &Path) -> Result<(), UpdateError> {
	let exe = std::env::current_exe()?;
	let current = super::enclosing_bundle(&exe).ok_or_else(|| {
		UpdateError::Install("not running from an app bundle".into())
	})?;

	let staging = payload.with_file_name("bundle");
	let _ = fs::remove_dir_all(&staging);
	fs::create_dir_all(&staging)?;
	extract(payload, &staging)?;
	let fresh = sole_bundle(&staging)?;

	match swap(&fresh, &current) {
		Ok(()) => {
			let _ = fs::remove_dir_all(&staging);
			Ok(())
		}
		Err(_) => Err(offer_drag(&staging)),
	}
}

pub fn relaunch_after_exit() {
	let Ok(exe) = std::env::current_exe() else {
		return;
	};
	let Some(bundle) = super::enclosing_bundle(&exe) else {
		return;
	};
	let _ = Command::new("/bin/sh")
		.arg("-c")
		.arg("while kill -0 \"$1\" 2>/dev/null; do sleep 0.1; done; exec /usr/bin/open -n \"$2\"")
		.arg("open-grind-relaunch")
		.arg(std::process::id().to_string())
		.arg(bundle)
		.spawn();
}

fn extract(archive: &Path, into: &Path) -> Result<(), UpdateError> {
	let status = Command::new("/usr/bin/ditto")
		.args(["-x", "-k"])
		.arg(archive)
		.arg(into)
		.status()?;
	if status.success() {
		return Ok(());
	}
	Err(UpdateError::Install("could not unpack the update".into()))
}

fn sole_bundle(staging: &Path) -> Result<PathBuf, UpdateError> {
	let mut bundles = fs::read_dir(staging)?
		.filter_map(Result::ok)
		.map(|entry| entry.path())
		.filter(|path| path.extension().is_some_and(|kind| kind == "app"));
	let bundle = bundles.next().ok_or_else(|| {
		UpdateError::Install("the update holds no app bundle".into())
	})?;
	if bundles.next().is_some() {
		return Err(UpdateError::Install(
			"the update holds more than one app bundle".into(),
		));
	}
	Ok(bundle)
}

fn swap(fresh: &Path, current: &Path) -> Result<(), UpdateError> {
	let from = CString::new(fresh.as_os_str().as_encoded_bytes())
		.map_err(|_| UpdateError::Install("unusable bundle path".into()))?;
	let to = CString::new(current.as_os_str().as_encoded_bytes())
		.map_err(|_| UpdateError::Install("unusable bundle path".into()))?;

	let swapped =
		unsafe { renamex_np(from.as_ptr(), to.as_ptr(), RENAME_SWAP) };
	if swapped == 0 {
		return Ok(());
	}
	Err(std::io::Error::last_os_error().into())
}

fn offer_drag(staging: &Path) -> UpdateError {
	let _ = symlink("/Applications", staging.join("Applications"));
	let _ = Command::new("/usr/bin/open").arg(staging).status();
	UpdateError::NeedsManualInstall
}

#[cfg(test)]
mod tests {
	use super::*;

	fn scratch(name: &str) -> PathBuf {
		let dir = std::env::temp_dir()
			.join(format!("og-bundle-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&dir);
		fs::create_dir_all(&dir).unwrap();
		dir
	}

	#[test]
	fn a_bundle_is_swapped_in_one_step_even_while_it_is_in_use() {
		let dir = scratch("swap");
		let current = dir.join("Open Grind.app");
		let fresh = dir.join("fresh.app");
		fs::create_dir_all(current.join("Contents")).unwrap();
		fs::create_dir_all(fresh.join("Contents")).unwrap();
		fs::write(current.join("Contents/marker"), b"old").unwrap();
		fs::write(fresh.join("Contents/marker"), b"new").unwrap();

		swap(&fresh, &current).unwrap();

		assert_eq!(fs::read(current.join("Contents/marker")).unwrap(), b"new");
		assert_eq!(fs::read(fresh.join("Contents/marker")).unwrap(), b"old");
		let _ = fs::remove_dir_all(dir);
	}

	#[test]
	fn a_swap_onto_a_path_that_is_not_there_fails_instead_of_half_applying() {
		let dir = scratch("absent");
		let fresh = dir.join("fresh.app");
		fs::create_dir_all(&fresh).unwrap();

		swap(&fresh, &dir.join("Missing.app")).unwrap_err();

		assert!(fresh.exists());
		let _ = fs::remove_dir_all(dir);
	}

	#[test]
	fn exactly_one_bundle_may_be_applied() {
		let dir = scratch("sole");
		fs::create_dir_all(dir.join("One.app")).unwrap();
		assert_eq!(sole_bundle(&dir).unwrap(), dir.join("One.app"));

		fs::create_dir_all(dir.join("Two.app")).unwrap();
		sole_bundle(&dir).unwrap_err();

		let empty = scratch("empty");
		sole_bundle(&empty).unwrap_err();
		let _ = fs::remove_dir_all(dir);
		let _ = fs::remove_dir_all(empty);
	}
}
