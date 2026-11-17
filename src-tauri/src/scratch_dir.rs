use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub struct ScratchDir(PathBuf);

impl ScratchDir {
	pub fn new() -> Self {
		static NEXT: AtomicU64 = AtomicU64::new(0);
		let dir = std::env::temp_dir().join(format!(
			"open-grind-scratch-{}-{}",
			std::process::id(),
			NEXT.fetch_add(1, Ordering::Relaxed)
		));
		fs::create_dir_all(&dir).unwrap();
		Self(dir)
	}
}

impl std::ops::Deref for ScratchDir {
	type Target = Path;

	fn deref(&self) -> &Path {
		&self.0
	}
}

impl Drop for ScratchDir {
	fn drop(&mut self) {
		fs::remove_dir_all(&self.0).ok();
	}
}
