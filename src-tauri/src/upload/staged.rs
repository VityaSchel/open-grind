use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

use super::media_error;
use crate::error::AppError;
use crate::photo;

const DIRECTORY: &str = "staged-media";

const NOT_STAGED: &str = "That file was never staged by this app";

pub struct StagedMedia(PathBuf);

impl StagedMedia {
	pub fn of<R: Runtime>(app: &AppHandle<R>) -> io::Result<Self> {
		app.path()
			.app_cache_dir()
			.map(|cache| Self(cache.join(DIRECTORY)))
			.map_err(io::Error::other)
	}

	#[cfg(test)]
	pub fn at(directory: PathBuf) -> Self {
		Self(directory)
	}

	#[cfg(any(test, target_os = "android"))]
	pub fn directory(&self) -> &std::path::Path {
		&self.0
	}

	pub fn path(&self, id: &str) -> io::Result<PathBuf> {
		let id = Uuid::try_parse(id).map_err(|_| {
			io::Error::new(io::ErrorKind::InvalidInput, NOT_STAGED)
		})?;
		Ok(self.0.join(id.hyphenated().to_string()))
	}

	pub fn create(&self) -> io::Result<String> {
		fs::create_dir_all(&self.0)?;
		let id = Uuid::new_v4().hyphenated().to_string();
		File::create_new(self.0.join(&id))?;
		Ok(id)
	}

	pub fn appender(&self, id: &str) -> io::Result<File> {
		OpenOptions::new().append(true).open(self.path(id)?)
	}

	pub fn append(&self, id: &str, bytes: &[u8]) -> io::Result<()> {
		self.appender(id)?.write_all(bytes)
	}

	pub fn discard(&self, id: &str) -> io::Result<()> {
		ignore_missing(fs::remove_file(self.path(id)?))
	}

	pub fn discard_all(&self) -> io::Result<()> {
		ignore_missing(fs::remove_dir_all(&self.0))
	}
}

fn ignore_missing(removed: io::Result<()>) -> io::Result<()> {
	match removed {
		Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
		removed => removed,
	}
}

pub fn discard_all<R: Runtime>(app: &AppHandle<R>) {
	if let Err(error) =
		StagedMedia::of(app).and_then(|staged| staged.discard_all())
	{
		tracing::warn!("[upload] could not clear staged media: {error}");
	}
}

#[tauri::command]
pub async fn stage_media(app: AppHandle) -> Result<String, AppError> {
	photo::off_thread(move || StagedMedia::of(&app)?.create())
		.await?
		.map_err(media_error)
}

#[tauri::command]
pub async fn append_staged_media(
	app: AppHandle,
	id: String,
	chunk: String,
) -> Result<(), AppError> {
	let bytes = STANDARD
		.decode(chunk)
		.map_err(|error| AppError::Media(error.to_string()))?;
	photo::off_thread(move || StagedMedia::of(&app)?.append(&id, &bytes))
		.await?
		.map_err(media_error)
}

#[tauri::command]
pub async fn discard_staged_media(
	app: AppHandle,
	id: String,
) -> Result<(), AppError> {
	photo::off_thread(move || StagedMedia::of(&app)?.discard(&id))
		.await?
		.map_err(media_error)
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicUsize, Ordering};

	use super::*;

	static NEXT: AtomicUsize = AtomicUsize::new(0);

	struct TempStage(StagedMedia);

	impl TempStage {
		fn new() -> Self {
			Self(StagedMedia(std::env::temp_dir().join(format!(
				"og-staged-{}-{}",
				std::process::id(),
				NEXT.fetch_add(1, Ordering::Relaxed)
			))))
		}
	}

	impl Drop for TempStage {
		fn drop(&mut self) {
			fs::remove_dir_all(&self.0 .0).ok();
		}
	}

	#[test]
	fn appended_chunks_land_in_order() {
		let stage = TempStage::new();
		let id = stage.0.create().expect("create");

		stage.0.append(&id, b"first ").expect("append");
		stage.0.append(&id, b"second").expect("append");

		assert_eq!(
			fs::read(stage.0.path(&id).expect("path")).expect("read"),
			b"first second"
		);
	}

	#[test]
	fn appending_to_a_file_that_was_never_staged_fails() {
		let stage = TempStage::new();
		fs::create_dir_all(&stage.0 .0).expect("directory");

		let refused = stage
			.0
			.append(&Uuid::new_v4().to_string(), b"bytes")
			.expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::NotFound);
	}

	#[test]
	fn only_uuids_name_staged_files() {
		let stage = TempStage::new();
		for id in ["", "../preferences.data", "staged", "/etc/passwd"] {
			let refused = stage.0.path(id).expect_err(id);
			assert_eq!(refused.kind(), io::ErrorKind::InvalidInput);
			assert_eq!(refused.to_string(), NOT_STAGED);
		}
	}

	#[test]
	fn every_spelling_of_a_uuid_names_the_same_file() {
		let stage = TempStage::new();
		let id = stage.0.create().expect("create");
		let uuid = Uuid::try_parse(&id).expect("uuid");

		for spelling in [
			uuid.simple().to_string(),
			uuid.braced().to_string(),
			id.to_uppercase(),
		] {
			assert_eq!(
				stage.0.path(&spelling).expect("path"),
				stage.0.path(&id).expect("path")
			);
		}
	}

	#[test]
	fn discarding_removes_the_file_and_tolerates_a_second_call() {
		let stage = TempStage::new();
		let id = stage.0.create().expect("create");

		stage.0.discard(&id).expect("discard");
		stage.0.discard(&id).expect("discard again");

		assert!(!stage.0.path(&id).expect("path").exists());
	}

	#[test]
	fn discarding_everything_removes_the_directory() {
		let stage = TempStage::new();
		stage.0.create().expect("create");

		stage.0.discard_all().expect("discard all");
		stage.0.discard_all().expect("discard all again");

		assert!(!stage.0 .0.exists());
	}
}
