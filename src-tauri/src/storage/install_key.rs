use std::fs;
use std::io;
use std::path::Path;
#[cfg(target_os = "ios")]
use std::path::PathBuf;
#[cfg(target_os = "ios")]
use std::sync::{Arc, OnceLock};

use keyring_core::CredentialStore;

use super::keyring::{exclusive, SERVICE};
use super::private_file::replace_private;
#[cfg(target_os = "ios")]
use super::sealed::SealedStore;
use super::sealed::SealingKey;
use super::ACCOUNTS;

const KEY_FILE: &str = "keychain.key";

#[cfg(target_os = "ios")]
static LOCATION: OnceLock<PathBuf> = OnceLock::new();

#[cfg(target_os = "ios")]
pub(super) fn locate(dir: PathBuf) {
	let _ = LOCATION.set(dir);
}

#[cfg(target_os = "ios")]
pub(super) fn seal(
	keychain: Arc<CredentialStore>,
) -> Result<Arc<CredentialStore>, String> {
	let dir = LOCATION.get().ok_or("the install key has no location")?;
	let key = load_or_erase(dir, &*keychain)?;
	Ok(Arc::new(SealedStore::new(keychain, key)))
}

fn load_or_erase(
	dir: &Path,
	keychain: &CredentialStore,
) -> Result<SealingKey, String> {
	let path = dir.join(KEY_FILE);
	match fs::read(&path) {
		Ok(bytes) => match SealingKey::from_bytes(&bytes) {
			Some(key) => return Ok(key),
			None => tracing::warn!(
				"[storage] the install key is malformed, starting over"
			),
		},
		Err(e) if e.kind() == io::ErrorKind::NotFound => {}
		Err(e) => return Err(format!("could not read the install key: {e}")),
	}
	erase(keychain).map_err(|e| {
		format!("could not erase the secrets of a previous install: {e}")
	})?;
	let key = SealingKey::generate();
	fs::create_dir_all(dir)
		.and_then(|()| replace_private(&path, key.as_bytes()))
		.map_err(|e| format!("could not write the install key: {e}"))?;
	Ok(key)
}

fn erase(keychain: &CredentialStore) -> keyring_core::Result<()> {
	let _exclusive = exclusive();
	for account in ACCOUNTS {
		match keychain.build(SERVICE, account, None)?.delete_credential() {
			Ok(()) | Err(keyring_core::Error::NoEntry) => {}
			Err(e) => return Err(e),
		}
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use std::os::unix::fs::PermissionsExt;
	use std::sync::Arc;

	use keyring_core::api::CredentialStoreApi;
	use keyring_core::mock;

	use super::*;
	use crate::storage::file_store::scratch_dir;

	fn store(keychain: &mock::Store, accounts: &[&str]) {
		for account in accounts {
			keychain
				.build(SERVICE, account, None)
				.unwrap()
				.set_secret(b"sealed secret")
				.unwrap();
		}
	}

	fn keychain_holding(accounts: &[&str]) -> Arc<mock::Store> {
		let keychain = mock::Store::new().unwrap();
		store(&keychain, accounts);
		keychain
	}

	fn kept(keychain: &mock::Store) -> Vec<&'static str> {
		ACCOUNTS
			.into_iter()
			.filter(|account| {
				keychain
					.build(SERVICE, account, None)
					.unwrap()
					.get_secret()
					.is_ok()
			})
			.collect()
	}

	#[test]
	fn a_fresh_install_erases_every_known_secret() {
		let dir = scratch_dir();
		let keychain = keychain_holding(&ACCOUNTS);

		load_or_erase(&dir, &*keychain).unwrap();

		assert!(kept(&keychain).is_empty());
		fs::remove_dir_all(&dir).ok();
	}

	#[test]
	fn the_key_is_a_private_32_byte_file_and_no_temp_is_left_behind() {
		let base = scratch_dir();
		let dir = base.join("Library/Application Support/org.opengrind.app");

		let key = load_or_erase(&dir, &*mock::Store::new().unwrap()).unwrap();

		let path = dir.join(KEY_FILE);
		assert_eq!(fs::read(&path).unwrap(), key.as_bytes());
		assert_eq!(key.as_bytes().len(), 32);
		assert_eq!(
			fs::metadata(&path).unwrap().permissions().mode() & 0o777,
			0o600
		);
		assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
		fs::remove_dir_all(&base).ok();
	}

	#[test]
	fn a_relaunch_keeps_the_key_and_every_secret() {
		let dir = scratch_dir();
		let keychain = mock::Store::new().unwrap();
		let first = load_or_erase(&dir, &*keychain).unwrap();
		store(&keychain, &ACCOUNTS);

		let second = load_or_erase(&dir, &*keychain).unwrap();

		assert_eq!(first.as_bytes(), second.as_bytes());
		assert_eq!(kept(&keychain), ACCOUNTS);
		fs::remove_dir_all(&dir).ok();
	}

	#[test]
	fn a_reinstall_erases_the_previous_install_and_draws_a_new_key() {
		let dir = scratch_dir();
		let previous =
			load_or_erase(&dir, &*mock::Store::new().unwrap()).unwrap();
		let keychain = keychain_holding(&ACCOUNTS);
		fs::remove_file(dir.join(KEY_FILE)).unwrap();

		let reinstalled = load_or_erase(&dir, &*keychain).unwrap();

		assert!(kept(&keychain).is_empty());
		assert_ne!(previous.as_bytes(), reinstalled.as_bytes());
		fs::remove_dir_all(&dir).ok();
	}

	#[test]
	fn a_malformed_key_is_replaced_and_the_secrets_erased() {
		let dir = scratch_dir();
		fs::write(dir.join(KEY_FILE), b"too short").unwrap();
		let keychain = keychain_holding(&ACCOUNTS);

		let key = load_or_erase(&dir, &*keychain).unwrap();

		assert!(kept(&keychain).is_empty());
		assert_eq!(fs::read(dir.join(KEY_FILE)).unwrap(), key.as_bytes());
		fs::remove_dir_all(&dir).ok();
	}

	#[test]
	fn a_failed_erase_writes_no_key_so_the_next_launch_erases_again() {
		let dir = scratch_dir();
		let keychain = keychain_holding(&ACCOUNTS);
		let locked = keychain.build(SERVICE, ACCOUNTS[1], None).unwrap();
		locked
			.as_any()
			.downcast_ref::<mock::Cred>()
			.unwrap()
			.set_error(keyring_core::Error::PlatformFailure(Box::new(
				io::Error::other("keychain locked"),
			)));

		assert!(load_or_erase(&dir, &*keychain).is_err());
		assert!(!dir.join(KEY_FILE).exists());

		load_or_erase(&dir, &*keychain).unwrap();
		assert!(kept(&keychain).is_empty());
		assert!(dir.join(KEY_FILE).exists());
		fs::remove_dir_all(&dir).ok();
	}

	#[test]
	fn an_unreadable_key_erases_nothing() {
		let dir = scratch_dir();
		fs::create_dir(dir.join(KEY_FILE)).unwrap();
		let keychain = keychain_holding(&ACCOUNTS);

		assert!(load_or_erase(&dir, &*keychain).is_err());

		assert_eq!(kept(&keychain), ACCOUNTS);
		fs::remove_dir_all(&dir).ok();
	}
}
