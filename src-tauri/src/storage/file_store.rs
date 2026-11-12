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

const CREDENTIALS: &str = "credentials";
const DISCARDED: &str = "credentials.discarded";

fn credential_path(
	base: &std::path::Path,
	_service: &str,
	user: &str,
) -> PathBuf {
	let safe = |s: &str| s.replace(['/', '\\', '\0', ':'], "_");
	base.join(CREDENTIALS).join(safe(user))
}

fn remove_tree(path: &std::path::Path) -> std::io::Result<()> {
	match fs::remove_dir_all(path) {
		Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
		result => result,
	}
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

fn write_private(path: &std::path::Path, secret: &[u8]) -> std::io::Result<()> {
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

impl FileStore {
	pub fn discard(&self) -> std::io::Result<()> {
		let discarded = self.base.join(DISCARDED);
		remove_tree(&discarded)?;
		match fs::rename(self.base.join(CREDENTIALS), &discarded) {
			Ok(()) => {}
			Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
			Err(e) => return Err(e),
		}
		if let Err(e) = remove_tree(&discarded) {
			tracing::warn!(
				"[storage] could not remove the discarded file store: {e}"
			);
		}
		Ok(())
	}
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
	if let Err(e) = remove_tree(&base.join(DISCARDED)) {
		tracing::warn!(
			"[storage] could not remove the discarded file store: {e}"
		);
	}
	let creds_dir = base.join(CREDENTIALS);
	if let Ok(()) = fs::create_dir_all(&creds_dir) {
		let _ =
			fs::set_permissions(&creds_dir, fs::Permissions::from_mode(0o700));
	}
	let store = Arc::new(FileStore { base }) as Arc<CredentialStore>;
	keyring_core::set_default_store(store);
}

#[cfg(test)]
pub(super) fn scratch_dir() -> PathBuf {
	use std::sync::atomic::AtomicUsize;

	static NEXT: AtomicUsize = AtomicUsize::new(0);
	let dir = std::env::temp_dir().join(format!(
		"open-grind-file-store-{}-{}",
		std::process::id(),
		NEXT.fetch_add(1, Ordering::Relaxed)
	));
	fs::create_dir_all(&dir).unwrap();
	dir
}

#[cfg(test)]
mod tests {
	use std::os::unix::fs::PermissionsExt;

	use super::*;

	const SERVICE: &str = "open-grind";
	const USER: &str = "session";

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

	#[test]
	fn a_secret_that_was_never_written_reads_as_no_entry() {
		let base = scratch_dir();

		assert!(matches!(
			credential(&base).get_secret(),
			Err(Error::NoEntry)
		));

		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn arbitrary_bytes_survive_a_write_and_read() {
		let base = scratch_dir();
		let secret: Vec<u8> = (0u8..=255).collect();
		let cred = credential(&base);

		cred.set_secret(&secret).unwrap();

		assert_eq!(cred.get_secret().unwrap(), secret);

		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn deleting_removes_the_file_and_a_second_delete_reports_no_entry() {
		let base = scratch_dir();
		let cred = credential(&base);
		cred.set_secret(b"token").unwrap();

		cred.delete_credential().unwrap();

		assert!(!credential_path(&base, SERVICE, USER).exists());
		assert!(matches!(cred.get_secret(), Err(Error::NoEntry)));
		assert!(matches!(cred.delete_credential(), Err(Error::NoEntry)));

		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn a_user_name_cannot_reach_outside_the_credentials_directory() {
		let base = std::path::Path::new("/app-data");
		let escapes = [
			("../../../etc/passwd", ".._.._.._etc_passwd"),
			("..\\..\\windows", ".._.._windows"),
			("/etc/shadow", "_etc_shadow"),
			("a:b", "a_b"),
			("a\0b", "a_b"),
		];

		for (user, flattened) in escapes {
			let path = credential_path(base, SERVICE, user);
			assert_eq!(path.parent().unwrap(), base.join("credentials"));
			assert_eq!(path.file_name().unwrap(), flattened);
		}
	}

	#[test]
	fn a_traversing_user_name_writes_inside_the_credentials_directory() {
		let base = scratch_dir();
		let cred = FileCredential {
			service: SERVICE.to_owned(),
			user: "../../escaped".to_owned(),
			base: base.clone(),
		};

		cred.set_secret(b"token").unwrap();

		let written: Vec<_> = fs::read_dir(base.join("credentials"))
			.unwrap()
			.map(|e| e.unwrap().file_name())
			.collect();
		assert_eq!(written, [".._.._escaped"]);
		assert_eq!(cred.get_secret().unwrap().as_slice(), b"token");

		fs::remove_dir_all(&base).ok();
	}

	fn store(base: &std::path::Path) -> FileStore {
		FileStore {
			base: base.to_path_buf(),
		}
	}

	#[test]
	fn discarding_removes_every_secret_and_unfinished_write() {
		let base = scratch_dir();
		credential(&base).set_secret(b"token").unwrap();
		fs::write(base.join(CREDENTIALS).join("session.1.0.tmp"), b"half")
			.unwrap();

		store(&base).discard().unwrap();

		assert!(!base.join(CREDENTIALS).exists());
		assert!(!base.join(DISCARDED).exists());
		assert!(matches!(
			credential(&base).get_secret(),
			Err(Error::NoEntry)
		));
		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn discarding_a_store_that_never_wrote_anything_succeeds() {
		let base = scratch_dir();

		assert!(store(&base).discard().is_ok());
		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn a_blocked_discard_reports_the_error_and_keeps_every_secret() {
		let base = scratch_dir();
		credential(&base).set_secret(b"token").unwrap();
		fs::write(base.join(DISCARDED), b"").unwrap();

		assert!(store(&base).discard().is_err());
		assert_eq!(
			credential(&base).get_secret().unwrap().as_slice(),
			b"token"
		);
		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn a_half_removed_discard_is_cleared_at_the_next_start() {
		let base = scratch_dir();
		fs::create_dir_all(base.join(DISCARDED)).unwrap();
		fs::write(base.join(DISCARDED).join(USER), b"token").unwrap();

		let _guard = crate::storage::test_support::lock();
		init(base.clone());

		assert!(!base.join(DISCARDED).exists());
		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn discarding_replaces_a_leftover_discard() {
		let base = scratch_dir();
		credential(&base).set_secret(b"token").unwrap();
		fs::create_dir_all(base.join(DISCARDED)).unwrap();
		fs::write(base.join(DISCARDED).join(USER), b"older token").unwrap();

		store(&base).discard().unwrap();

		assert!(!base.join(CREDENTIALS).exists());
		assert!(!base.join(DISCARDED).exists());
		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn a_store_that_cannot_be_moved_aside_reports_the_error_and_keeps_every_secret(
	) {
		let base = scratch_dir();
		credential(&base).set_secret(b"token").unwrap();
		fs::set_permissions(&base, fs::Permissions::from_mode(0o500)).unwrap();
		let denied = fs::create_dir(base.join(DISCARDED)).is_err();

		let discarded = store(&base).discard();
		fs::set_permissions(&base, fs::Permissions::from_mode(0o700)).unwrap();

		if denied {
			assert!(discarded.is_err());
			assert_eq!(
				credential(&base).get_secret().unwrap().as_slice(),
				b"token"
			);
		}
		fs::remove_dir_all(&base).ok();
	}
}
