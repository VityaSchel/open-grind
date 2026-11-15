use std::fs;
use std::io::{self, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

fn temp_path(path: &Path) -> PathBuf {
	static NEXT: AtomicU64 = AtomicU64::new(0);
	let mut temp = path.to_path_buf().into_os_string();
	temp.push(format!(
		".{}.{}.tmp",
		std::process::id(),
		NEXT.fetch_add(1, Ordering::Relaxed)
	));
	PathBuf::from(temp)
}

fn write_private(path: &Path, secret: &[u8]) -> io::Result<()> {
	let mut file = fs::OpenOptions::new()
		.write(true)
		.create_new(true)
		.mode(0o600)
		.open(path)?;
	file.write_all(secret)?;
	file.sync_all()
}

pub(super) fn replace_private(path: &Path, secret: &[u8]) -> io::Result<()> {
	let temp = temp_path(path);
	write_private(&temp, secret)
		.and_then(|()| fs::rename(&temp, path))
		.inspect_err(|_| {
			fs::remove_file(&temp).ok();
		})
}

#[cfg(test)]
pub(super) struct ScratchDir(PathBuf);

#[cfg(test)]
impl ScratchDir {
	pub(super) fn new() -> Self {
		static NEXT: AtomicU64 = AtomicU64::new(0);
		let dir = std::env::temp_dir().join(format!(
			"open-grind-file-store-{}-{}",
			std::process::id(),
			NEXT.fetch_add(1, Ordering::Relaxed)
		));
		fs::create_dir_all(&dir).unwrap();
		Self(dir)
	}
}

#[cfg(test)]
impl std::ops::Deref for ScratchDir {
	type Target = Path;

	fn deref(&self) -> &Path {
		&self.0
	}
}

#[cfg(test)]
impl Drop for ScratchDir {
	fn drop(&mut self) {
		fs::remove_dir_all(&self.0).ok();
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn temp_paths_are_unique_per_write() {
		let path = Path::new("/nonexistent/session");
		assert_ne!(temp_path(path), temp_path(path));
	}

	#[test]
	fn write_private_never_writes_into_an_existing_file() {
		let base = ScratchDir::new();
		let occupied = base.join("occupied");
		fs::write(&occupied, b"original").unwrap();

		assert!(write_private(&occupied, b"replacement").is_err());
		assert_eq!(fs::read(&occupied).unwrap().as_slice(), b"original");
	}
}
