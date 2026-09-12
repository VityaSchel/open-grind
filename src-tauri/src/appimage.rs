#[cfg(not(target_os = "android"))]
use std::fs;
#[cfg(not(target_os = "android"))]
use std::path::Path;
use std::path::PathBuf;

pub fn path() -> Option<PathBuf> {
	std::env::var_os("APPIMAGE")
		.map(PathBuf::from)
		.filter(|path| path.is_absolute() && path.is_file())
}

#[cfg(not(target_os = "android"))]
pub fn replaceable() -> Option<PathBuf> {
	let path = path()?;
	accepts_new_files(path.parent()?).then_some(path)
}

#[cfg(not(target_os = "android"))]
fn accepts_new_files(dir: &Path) -> bool {
	let probe = dir.join(format!(".open-grind-{}.probe", std::process::id()));
	let accepted = fs::File::create(&probe).is_ok();
	let _ = fs::remove_file(&probe);
	accepted
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_writable_directory_accepts_the_replacement() {
		assert!(accepts_new_files(&std::env::temp_dir()));
	}

	#[test]
	fn a_directory_that_is_not_there_accepts_nothing() {
		assert!(!accepts_new_files(&std::env::temp_dir().join("og-absent")));
	}

	#[test]
	fn the_probe_leaves_nothing_behind() {
		let dir = std::env::temp_dir()
			.join(format!("og-probe-{}", std::process::id()));
		fs::create_dir_all(&dir).unwrap();

		assert!(accepts_new_files(&dir));

		assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
		let _ = fs::remove_dir_all(&dir);
	}
}
