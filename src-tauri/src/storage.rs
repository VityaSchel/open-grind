#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
mod file_store {
	use keyring_core::api::{
		CredentialApi, CredentialPersistence, CredentialStoreApi,
	};
	use keyring_core::{Credential, CredentialStore, Entry, Error, Result};
	use std::any::Any;
	use std::collections::HashMap;
	use std::fs;
	use std::path::PathBuf;
	use std::sync::atomic::{AtomicU64, Ordering};
	use std::sync::Arc;

	fn credential_path(
		base: &std::path::Path,
		_service: &str,
		user: &str,
	) -> PathBuf {
		let safe = |s: &str| s.replace(['/', '\\', '\0', ':'], "_");
		base.join("credentials").join(safe(user))
	}

	fn temp_path(path: &std::path::Path) -> PathBuf {
		static NEXT: AtomicU64 = AtomicU64::new(0);
		let mut temp = path.to_path_buf().into_os_string();
		temp.push(format!(
			".{}.{}.tmp",
			std::process::id(),
			NEXT.fetch_add(1, Ordering::Relaxed)
		));
		PathBuf::from(temp)
	}

	fn write_private(
		path: &std::path::Path,
		secret: &[u8],
	) -> std::io::Result<()> {
		use std::io::Write;
		use std::os::unix::fs::OpenOptionsExt;

		let mut file = fs::OpenOptions::new()
			.write(true)
			.create_new(true)
			.mode(0o600)
			.open(path)?;
		file.write_all(secret)?;
		file.sync_all()
	}

	#[derive(Debug, Clone)]
	pub struct FileCredential {
		service: String,
		user: String,
		base: PathBuf,
	}

	impl CredentialApi for FileCredential {
		fn set_secret(&self, secret: &[u8]) -> Result<()> {
			use std::os::unix::fs::PermissionsExt;
			let path = credential_path(&self.base, &self.service, &self.user);
			let dir = path.parent().ok_or_else(|| {
				Error::PlatformFailure(Box::new(std::io::Error::new(
					std::io::ErrorKind::InvalidInput,
					"credential path has no parent directory",
				)))
			})?;
			fs::create_dir_all(dir)
				.map_err(|e| Error::PlatformFailure(Box::new(e)))?;
			fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
				.map_err(|e| Error::PlatformFailure(Box::new(e)))?;
			let temp = temp_path(&path);
			write_private(&temp, secret)
				.and_then(|()| fs::rename(&temp, &path))
				.map_err(|e| {
					fs::remove_file(&temp).ok();
					Error::PlatformFailure(Box::new(e))
				})
		}

		fn get_secret(&self) -> Result<Vec<u8>> {
			let path = credential_path(&self.base, &self.service, &self.user);
			match fs::read(&path) {
				Ok(bytes) => Ok(bytes),
				Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
					Err(Error::NoEntry)
				}
				Err(e) => Err(Error::PlatformFailure(Box::new(e))),
			}
		}

		fn delete_credential(&self) -> Result<()> {
			let path = credential_path(&self.base, &self.service, &self.user);
			match fs::remove_file(&path) {
				Ok(()) => Ok(()),
				Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
					Err(Error::NoEntry)
				}
				Err(e) => Err(Error::PlatformFailure(Box::new(e))),
			}
		}

		fn get_credential(&self) -> Result<Option<Arc<Credential>>> {
			Ok(None)
		}

		fn get_specifiers(&self) -> Option<(String, String)> {
			Some((self.service.clone(), self.user.clone()))
		}

		fn as_any(&self) -> &dyn Any {
			self
		}
	}

	#[derive(Debug)]
	pub struct FileStore {
		base: PathBuf,
	}

	impl CredentialStoreApi for FileStore {
		fn vendor(&self) -> String {
			"open-grind file store".to_string()
		}

		fn id(&self) -> String {
			"file-store-v1".to_string()
		}

		fn build(
			&self,
			service: &str,
			user: &str,
			_modifiers: Option<&HashMap<&str, &str>>,
		) -> Result<Entry> {
			let cred = Arc::new(FileCredential {
				service: service.to_string(),
				user: user.to_string(),
				base: self.base.clone(),
			}) as Arc<Credential>;
			Ok(Entry::new_with_credential(cred))
		}

		fn persistence(&self) -> CredentialPersistence {
			CredentialPersistence::UntilDelete
		}

		fn as_any(&self) -> &dyn Any {
			self
		}
	}

	pub fn init(base: PathBuf) {
		use std::os::unix::fs::PermissionsExt;
		let creds_dir = base.join("credentials");
		if let Ok(()) = fs::create_dir_all(&creds_dir) {
			let _ = fs::set_permissions(
				&creds_dir,
				fs::Permissions::from_mode(0o700),
			);
		}
		let store = Arc::new(FileStore { base }) as Arc<CredentialStore>;
		keyring_core::set_default_store(store);
	}

	#[cfg(test)]
	mod tests {
		use std::os::unix::fs::PermissionsExt;
		use std::sync::atomic::{AtomicUsize, Ordering};

		use super::*;

		const SERVICE: &str = "open-grind";
		const USER: &str = "session";

		fn scratch_dir() -> PathBuf {
			static NEXT: AtomicUsize = AtomicUsize::new(0);
			let dir = std::env::temp_dir().join(format!(
				"open-grind-file-store-{}-{}",
				std::process::id(),
				NEXT.fetch_add(1, Ordering::Relaxed)
			));
			fs::create_dir_all(&dir).unwrap();
			dir
		}

		fn credential(base: &std::path::Path) -> FileCredential {
			FileCredential {
				service: SERVICE.to_owned(),
				user: USER.to_owned(),
				base: base.to_path_buf(),
			}
		}

		fn mode_of(path: &std::path::Path) -> u32 {
			fs::metadata(path).unwrap().permissions().mode() & 0o777
		}

		fn leftover_temps(base: &std::path::Path) -> usize {
			fs::read_dir(base.join("credentials"))
				.unwrap()
				.filter(|e| {
					e.as_ref()
						.unwrap()
						.file_name()
						.to_string_lossy()
						.ends_with(".tmp")
				})
				.count()
		}

		#[test]
		fn set_secret_writes_a_private_file_and_leaves_no_temp_behind() {
			let base = scratch_dir();
			credential(&base).set_secret(b"token").unwrap();

			let path = credential_path(&base, SERVICE, USER);
			assert_eq!(fs::read(&path).unwrap().as_slice(), b"token");
			assert_eq!(mode_of(&path), 0o600);
			assert_eq!(leftover_temps(&base), 0);

			fs::remove_dir_all(&base).ok();
		}

		#[test]
		fn temp_paths_are_unique_per_write() {
			let path = credential_path(
				std::path::Path::new("/nonexistent"),
				SERVICE,
				USER,
			);
			assert_ne!(temp_path(&path), temp_path(&path));
		}

		#[test]
		fn write_private_never_writes_into_an_existing_file() {
			let base = scratch_dir();
			let occupied = base.join("occupied");
			fs::write(&occupied, b"original").unwrap();

			assert!(write_private(&occupied, b"replacement").is_err());
			assert_eq!(fs::read(&occupied).unwrap().as_slice(), b"original");

			fs::remove_dir_all(&base).ok();
		}

		#[test]
		fn set_secret_replaces_an_existing_secret() {
			let base = scratch_dir();
			let cred = credential(&base);
			cred.set_secret(b"first").unwrap();
			cred.set_secret(b"second").unwrap();

			assert_eq!(cred.get_secret().unwrap().as_slice(), b"second");
			assert_eq!(mode_of(&credential_path(&base, SERVICE, USER)), 0o600);

			fs::remove_dir_all(&base).ok();
		}

		#[test]
		fn a_failed_rename_reports_the_error_and_removes_the_temp() {
			let base = scratch_dir();
			let path = credential_path(&base, SERVICE, USER);
			fs::create_dir_all(&path).unwrap();

			assert!(credential(&base).set_secret(b"token").is_err());
			assert_eq!(leftover_temps(&base), 0);

			fs::remove_dir_all(&base).ok();
		}
	}
}

#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
pub fn init_file_store(base: std::path::PathBuf) {
	file_store::init(base);
}

pub fn init_keyring() {
	#[cfg(target_os = "ios")]
	match apple_native_keyring_store::protected::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => tracing::error!("[storage] could not init iOS keyring: {e}"),
	}

	#[cfg(target_os = "android")]
	match android_native_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init Android keyring: {e}")
		}
	}

	#[cfg(all(target_os = "macos", feature = "keychain"))]
	match apple_native_keyring_store::keychain::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init macOS keyring: {e}")
		}
	}

	#[cfg(target_os = "windows")]
	match windows_native_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => {
			tracing::error!("[storage] could not init Windows keyring: {e}")
		}
	}

	#[cfg(target_os = "linux")]
	match dbus_secret_service_keyring_store::Store::new() {
		Ok(store) => keyring_core::set_default_store(store),
		Err(e) => tracing::warn!(
			"[storage] no secret service, keeping file store: {e}"
		),
	}
}

use crate::error::AppError;

pub struct DeviceStorage;

impl DeviceStorage {
	fn entry() -> Result<keyring_core::Entry, AppError> {
		keyring_core::Entry::new("open-grind", "device-info")
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn load() -> Result<Option<grindr::DeviceInfo>, AppError> {
		let entry = Self::entry()?;
		let bytes = match entry.get_secret() {
			Ok(b) => b,
			Err(keyring_core::Error::NoEntry) => return Ok(None),
			Err(e) => return Err(AppError::Auth(e.to_string())),
		};
		rmp_serde::from_slice::<grindr::DeviceInfo>(&bytes)
			.map(Some)
			.map_err(|e| AppError::Auth(format!("device decode failed: {e}")))
	}

	pub fn save(device: &grindr::DeviceInfo) -> Result<(), AppError> {
		let bytes = rmp_serde::encode::to_vec(device).map_err(|e| {
			AppError::Auth(format!("device encode failed: {e}"))
		})?;
		Self::entry()?
			.set_secret(&bytes)
			.map_err(|e| AppError::Auth(e.to_string()))
	}
}

pub struct AuthStorage;

impl AuthStorage {
	fn entry() -> Result<keyring_core::Entry, AppError> {
		keyring_core::Entry::new("open-grind", "session")
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn get_session() -> Result<Option<grindr::Session>, AppError> {
		let entry = Self::entry()?;
		let bytes = match entry.get_secret() {
			Ok(b) => b,
			Err(keyring_core::Error::NoEntry) => return Ok(None),
			Err(e) => return Err(AppError::Auth(e.to_string())),
		};
		match rmp_serde::from_slice::<grindr::Session>(&bytes) {
			Ok(s) => Ok(Some(s)),
			Err(_) => {
				Self::delete_session();
				Ok(None)
			}
		}
	}

	pub fn set_session(session: &grindr::Session) -> Result<(), AppError> {
		let bytes = rmp_serde::encode::to_vec(session).map_err(|e| {
			AppError::Auth(format!("session encode failed: {e}"))
		})?;
		Self::entry()?
			.set_secret(&bytes)
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn delete_session() {
		match Self::entry() {
			Ok(entry) => match entry.delete_credential() {
				Ok(()) | Err(keyring_core::Error::NoEntry) => {}
				Err(e) => tracing::warn!(
					"[auth] failed to delete keyring session: {e}"
				),
			},
			Err(e) => tracing::warn!(
				"[auth] failed to open keyring entry for deletion: {e}"
			),
		}
	}
}

pub struct SigningKeyStorage;

impl SigningKeyStorage {
	fn entry() -> Result<keyring_core::Entry, AppError> {
		keyring_core::Entry::new("open-grind", "device-signing-key")
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn load() -> Result<Option<grindr::DeviceSigningKey>, AppError> {
		let bytes = match Self::entry()?.get_secret() {
			Ok(b) => b,
			Err(keyring_core::Error::NoEntry) => return Ok(None),
			Err(e) => return Err(AppError::Auth(e.to_string())),
		};
		Ok(rmp_serde::from_slice::<grindr::DeviceSigningKey>(&bytes).ok())
	}

	pub fn save(key: &grindr::DeviceSigningKey) -> Result<(), AppError> {
		let bytes = rmp_serde::encode::to_vec(key).map_err(|e| {
			AppError::Auth(format!("signing key encode failed: {e}"))
		})?;
		Self::entry()?
			.set_secret(&bytes)
			.map_err(|e| AppError::Auth(e.to_string()))
	}

	pub fn delete() {
		if let Ok(entry) = Self::entry() {
			match entry.delete_credential() {
				Ok(()) | Err(keyring_core::Error::NoEntry) => {}
				Err(e) => tracing::warn!(
					"[signing] failed to delete keyring key: {e}"
				),
			}
		}
	}
}
