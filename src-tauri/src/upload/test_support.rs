use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

static NEXT: AtomicUsize = AtomicUsize::new(0);

pub fn app() -> tauri::App<MockRuntime> {
	mock_builder()
		.plugin(tauri_plugin_fs::init())
		.build(mock_context(noop_assets()))
		.expect("mock app")
}

pub struct TempFile(PathBuf);

impl TempFile {
	pub fn new(name: &str, bytes: &[u8]) -> Self {
		let path = std::env::temp_dir().join(format!(
			"og-upload-{}-{}-{name}",
			std::process::id(),
			NEXT.fetch_add(1, Ordering::Relaxed)
		));
		File::create(&path)
			.expect("create")
			.write_all(bytes)
			.expect("write");
		Self(path)
	}

	pub fn path(&self) -> &Path {
		&self.0
	}
}

impl Drop for TempFile {
	fn drop(&mut self) {
		std::fs::remove_file(&self.0).ok();
	}
}
