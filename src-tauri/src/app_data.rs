use std::fs;
use std::io::{self, ErrorKind, Write};
use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeResponseBody, Response};
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AppDataFile {
	Preferences,
}

impl AppDataFile {
	const fn file_name(self) -> &'static str {
		match self {
			Self::Preferences => "preferences.data",
		}
	}
}

#[derive(Debug, Serialize)]
pub struct AppDataError(String);

impl From<io::Error> for AppDataError {
	fn from(error: io::Error) -> Self {
		Self(error.to_string())
	}
}

impl From<tauri::Error> for AppDataError {
	fn from(error: tauri::Error) -> Self {
		Self(error.to_string())
	}
}

impl From<base64::DecodeError> for AppDataError {
	fn from(error: base64::DecodeError) -> Self {
		Self(format!("content is not base64: {error}"))
	}
}

struct AppDataDir(PathBuf);

impl AppDataDir {
	fn of(app: &AppHandle) -> Result<Self, AppDataError> {
		Ok(Self(app.path().app_local_data_dir()?))
	}

	fn path(&self, file: AppDataFile) -> PathBuf {
		self.0.join(file.file_name())
	}

	fn temp_path(&self, file: AppDataFile) -> PathBuf {
		self.0.join(format!("{}.tmp", file.file_name()))
	}

	fn read(&self, file: AppDataFile) -> io::Result<Option<Vec<u8>>> {
		match fs::read(self.path(file)) {
			Ok(bytes) => Ok(Some(bytes)),
			Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
			Err(error) => Err(error),
		}
	}

	fn write_atomic(
		&self,
		file: AppDataFile,
		content: &[u8],
	) -> io::Result<()> {
		fs::create_dir_all(&self.0)?;
		let temp = self.temp_path(file);
		let written = fs::File::create(&temp)
			.and_then(|mut handle| {
				handle.write_all(content)?;
				handle.sync_all()
			})
			.and_then(|()| fs::rename(&temp, self.path(file)));
		if written.is_err() {
			fs::remove_file(&temp).ok();
		}
		written
	}

	fn remove(&self, file: AppDataFile) -> io::Result<()> {
		match fs::remove_file(self.path(file)) {
			Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
			removed => removed,
		}
	}
}

async fn off_the_runtime<T: Send + 'static>(
	work: impl FnOnce() -> io::Result<T> + Send + 'static,
) -> Result<T, AppDataError> {
	Ok(tauri::async_runtime::spawn_blocking(work).await??)
}

#[tauri::command]
pub async fn read_app_data(
	app: AppHandle,
	file: AppDataFile,
) -> Result<Response, AppDataError> {
	let dir = AppDataDir::of(&app)?;
	Ok(match off_the_runtime(move || dir.read(file)).await? {
		Some(bytes) => Response::new(bytes),
		None => Response::new(InvokeResponseBody::Json("null".to_owned())),
	})
}

#[tauri::command]
pub async fn write_app_data(
	app: AppHandle,
	file: AppDataFile,
	content: String,
) -> Result<(), AppDataError> {
	let bytes = STANDARD.decode(content)?;
	let dir = AppDataDir::of(&app)?;
	off_the_runtime(move || dir.write_atomic(file, &bytes)).await
}

#[tauri::command]
pub async fn remove_app_data(
	app: AppHandle,
	file: AppDataFile,
) -> Result<(), AppDataError> {
	let dir = AppDataDir::of(&app)?;
	off_the_runtime(move || dir.remove(file)).await
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicUsize, Ordering};

	use super::*;

	struct ScratchDir(PathBuf);

	impl ScratchDir {
		fn new() -> Self {
			static NEXT: AtomicUsize = AtomicUsize::new(0);
			Self(std::env::temp_dir().join(format!(
				"open-grind-app-data-{}-{}",
				std::process::id(),
				NEXT.fetch_add(1, Ordering::Relaxed)
			)))
		}

		fn app_data(&self) -> AppDataDir {
			AppDataDir(self.0.join("org.opengrind"))
		}

		fn entries(&self) -> Vec<String> {
			let mut names: Vec<String> =
				fs::read_dir(self.0.join("org.opengrind"))
					.unwrap()
					.map(|entry| {
						entry
							.unwrap()
							.file_name()
							.to_string_lossy()
							.into_owned()
					})
					.collect();
			names.sort();
			names
		}
	}

	impl Drop for ScratchDir {
		fn drop(&mut self) {
			fs::remove_dir_all(&self.0).ok();
		}
	}

	#[test]
	fn written_bytes_read_back_unchanged() {
		let scratch = ScratchDir::new();
		let dir = scratch.app_data();
		let content: Vec<u8> = (0u8..=255).collect();

		dir.write_atomic(AppDataFile::Preferences, &content)
			.unwrap();

		assert_eq!(dir.read(AppDataFile::Preferences).unwrap(), Some(content));
	}

	#[test]
	fn a_write_creates_the_missing_directory_and_leaves_no_temp_file() {
		let scratch = ScratchDir::new();
		let dir = scratch.app_data();

		dir.write_atomic(AppDataFile::Preferences, b"first")
			.unwrap();
		dir.write_atomic(AppDataFile::Preferences, b"second")
			.unwrap();

		assert_eq!(scratch.entries(), ["preferences.data"]);
		assert_eq!(
			dir.read(AppDataFile::Preferences).unwrap().as_deref(),
			Some(&b"second"[..])
		);
	}

	#[test]
	fn a_failed_rename_reports_the_error_and_removes_the_temp_file() {
		let scratch = ScratchDir::new();
		let dir = scratch.app_data();
		fs::create_dir_all(dir.path(AppDataFile::Preferences)).unwrap();
		fs::write(dir.path(AppDataFile::Preferences).join("occupant"), b"")
			.unwrap();

		assert!(dir
			.write_atomic(AppDataFile::Preferences, b"content")
			.is_err());

		assert_eq!(scratch.entries(), ["preferences.data"]);
	}

	#[test]
	fn a_file_that_was_never_written_reads_as_none() {
		let scratch = ScratchDir::new();

		assert_eq!(
			scratch.app_data().read(AppDataFile::Preferences).unwrap(),
			None
		);
	}

	#[test]
	fn removing_deletes_the_file_and_tolerates_a_missing_one() {
		let scratch = ScratchDir::new();
		let dir = scratch.app_data();
		dir.write_atomic(AppDataFile::Preferences, b"content")
			.unwrap();

		dir.remove(AppDataFile::Preferences).unwrap();
		dir.remove(AppDataFile::Preferences).unwrap();

		assert_eq!(dir.read(AppDataFile::Preferences).unwrap(), None);
	}

	#[test]
	fn the_webview_names_a_file_only_from_the_closed_set() {
		let named = |name: &str| {
			serde_json::from_value::<AppDataFile>(serde_json::json!(name))
		};

		assert_eq!(named("preferences").unwrap(), AppDataFile::Preferences);
		for rejected in [
			"preferences.data",
			"Preferences",
			"../preferences",
			"/data/user/0/org.opengrind/files/preferences.data",
			"content://org.opengrind/preferences",
			"credentials/session",
		] {
			assert!(named(rejected).is_err(), "{rejected} must be refused");
		}
	}
}

#[cfg(test)]
mod webview_file_grants {
	use std::path::Path;

	use serde_json::Value;

	const ANDROID_FILE_PICKER: &str = "android-fs:allow-show-open-file-picker";

	fn strings_in(value: &Value) -> Vec<String> {
		match value {
			Value::String(string) => vec![string.clone()],
			Value::Array(items) => items.iter().flat_map(strings_in).collect(),
			Value::Object(fields) => {
				fields.values().flat_map(strings_in).collect()
			}
			_ => Vec::new(),
		}
	}

	fn granted_permissions() -> Vec<(String, String)> {
		let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
		let capabilities = fs_entries(&manifest.join("capabilities"));
		let configs = ["tauri.conf.json", "tauri.appstore.conf.json"]
			.map(|name| manifest.join(name));
		assert!(!capabilities.is_empty());
		capabilities
			.into_iter()
			.chain(configs)
			.flat_map(|path| {
				let source = std::fs::read_to_string(&path).unwrap();
				let json: Value =
					serde_json::from_str(&source).unwrap_or_else(|error| {
						panic!("{} is not JSON: {error}", path.display())
					});
				let name = path.display().to_string();
				strings_in(&json)
					.into_iter()
					.map(move |string| (name.clone(), string))
			})
			.collect()
	}

	fn fs_entries(dir: &Path) -> Vec<std::path::PathBuf> {
		std::fs::read_dir(dir)
			.unwrap()
			.map(|entry| entry.unwrap().path())
			.collect()
	}

	#[test]
	fn no_capability_grants_the_fs_plugin() {
		for (file, permission) in granted_permissions() {
			assert!(
				!permission.starts_with("fs:"),
				"{file} grants {permission}; app data goes through app_data commands"
			);
		}
	}

	#[test]
	fn the_only_android_fs_grant_is_the_open_file_picker() {
		for (file, permission) in granted_permissions() {
			assert!(
				!permission.starts_with("android-fs:")
					|| permission == ANDROID_FILE_PICKER,
				"{file} grants {permission}; only {ANDROID_FILE_PICKER} is allowed"
			);
		}
	}
}
