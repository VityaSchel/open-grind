use std::fs;
use std::io::{self, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub(super) fn temp_path(path: &Path) -> PathBuf {
	static NEXT: AtomicU64 = AtomicU64::new(0);
	let mut temp = path.to_path_buf().into_os_string();
	temp.push(format!(
		".{}.{}.tmp",
		std::process::id(),
		NEXT.fetch_add(1, Ordering::Relaxed)
	));
	PathBuf::from(temp)
}

pub(super) fn write_private(path: &Path, secret: &[u8]) -> io::Result<()> {
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
pub(super) fn scratch_dir() -> PathBuf {
	static NEXT: AtomicU64 = AtomicU64::new(0);
	let dir = std::env::temp_dir().join(format!(
		"open-grind-file-store-{}-{}",
		std::process::id(),
		NEXT.fetch_add(1, Ordering::Relaxed)
	));
	fs::create_dir_all(&dir).unwrap();
	dir
}
