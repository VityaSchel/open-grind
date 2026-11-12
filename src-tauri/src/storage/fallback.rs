use keyring_core::{CredentialStore, Error};

use super::entries::{DEVICE_INFO, SESSION, SIGNING_KEY};
use super::keyring::SERVICE;
use super::{entry, HAS_FILE_STORE};
use crate::error::AppError;

const FALLBACK_MARKER: &str = "keyring-fallback";
const SIGN_OUT_MARKER: &str = "signed-out";

struct FileSet {
	marked: bool,
	signed_out: bool,
	session: Option<Vec<u8>>,
	device: Option<Vec<u8>>,
	signing_key: Option<Vec<u8>>,
}

impl FileSet {
	fn read(store: &CredentialStore) -> keyring_core::Result<Self> {
		let secret =
			|name: &str| match store.build(SERVICE, name, None)?.get_secret() {
				Ok(secret) => Ok(Some(secret)),
				Err(Error::NoEntry) => Ok(None),
				Err(e) => Err(e),
			};
		Ok(Self {
			marked: secret(FALLBACK_MARKER)?.is_some(),
			signed_out: secret(SIGN_OUT_MARKER)?.is_some(),
			session: secret(SESSION)?,
			device: secret(DEVICE_INFO)?,
			signing_key: secret(SIGNING_KEY)?,
		})
	}

	fn is_empty(&self) -> bool {
		!self.marked
			&& !self.signed_out
			&& self.session.is_none()
			&& self.device.is_none()
			&& self.signing_key.is_none()
	}

	fn outranks_keyring(&self, keyring_signed_in: bool) -> bool {
		if self.marked {
			self.session.is_some() || self.signed_out
		} else {
			self.session.is_some() && !keyring_signed_in
		}
	}
}

pub(super) fn keyring_takes_over(file_store: &CredentialStore) -> bool {
	let files = match FileSet::read(file_store) {
		Ok(files) if files.is_empty() => return true,
		Ok(files) => files,
		Err(e) => {
			tracing::warn!(
				"[storage] could not read the file store, leaving it: {e}"
			);
			return true;
		}
	};
	let keyring_signed_in = match holds(SESSION) {
		Ok(signed_in) => signed_in,
		Err(e) => {
			tracing::warn!(
				"[storage] could not read the keyring session, keeping the file store: {e}"
			);
			return false;
		}
	};
	if !files.outranks_keyring(keyring_signed_in) {
		if !keyring_signed_in {
			forget_keyring_device();
		}
		if let Err(e) = retire_file_store(file_store) {
			tracing::warn!("[storage] could not retire the file store: {e}");
		}
		return true;
	}
	let Err(e) =
		move_into_keyring(&files).and_then(|()| retire_file_store(file_store))
	else {
		return true;
	};
	tracing::warn!(
		"[storage] could not move the file store into the keyring, keeping the file store: {e}"
	);
	if let Err(cleanup) = replace(SESSION, None) {
		tracing::warn!(
			"[storage] could not clear a half-moved keyring session: {cleanup}"
		);
	}
	false
}

fn retire_file_store(file_store: &CredentialStore) -> Result<(), AppError> {
	let Err(e) = discard_file_store(file_store) else {
		return Ok(());
	};
	tracing::warn!(
		"[storage] could not discard the file store, clearing its sign-in instead: {e}"
	);
	[FALLBACK_MARKER, SIGN_OUT_MARKER, SESSION]
		.into_iter()
		.try_for_each(|name| {
			match file_store.build(SERVICE, name, None)?.delete_credential() {
				Ok(()) | Err(Error::NoEntry) => Ok(()),
				Err(e) => Err(e),
			}
		})
		.map_err(|e| AppError::Auth(e.to_string()))
}

pub(super) fn mark_fallback() {
	if let Err(e) = replace(FALLBACK_MARKER, Some(&[])) {
		tracing::warn!(
			"[storage] could not mark the file store as the keyring's fallback: {e}"
		);
	}
}

pub fn remember_sign_out() {
	if !HAS_FILE_STORE {
		return;
	}
	let remembered = holds(FALLBACK_MARKER).and_then(|marked| {
		if marked {
			replace(SIGN_OUT_MARKER, Some(&[]))
		} else {
			Ok(())
		}
	});
	if let Err(e) = remembered {
		tracing::warn!("[storage] could not remember the sign-out: {e}");
	}
}

fn move_into_keyring(files: &FileSet) -> Result<(), AppError> {
	replace(SESSION, None)?;
	replace(DEVICE_INFO, files.device.as_deref())?;
	replace(SIGNING_KEY, files.signing_key.as_deref())?;
	replace(SESSION, files.session.as_deref())
}

fn forget_keyring_device() {
	for name in [DEVICE_INFO, SIGNING_KEY] {
		if let Err(e) = replace(name, None) {
			tracing::warn!("[storage] could not clear the keyring {name}: {e}");
		}
	}
}

fn holds(name: &str) -> Result<bool, AppError> {
	match entry(name)?.get_secret() {
		Ok(_) => Ok(true),
		Err(Error::NoEntry) => Ok(false),
		Err(e) => Err(AppError::Auth(e.to_string())),
	}
}

fn replace(name: &str, secret: Option<&[u8]>) -> Result<(), AppError> {
	let entry = entry(name)?;
	let intact = match secret {
		Some(secret) => entry
			.set_secret(secret)
			.and_then(|()| entry.get_secret())
			.map(|stored| stored == secret),
		None => match entry.delete_credential() {
			Ok(()) | Err(Error::NoEntry) => Ok(true),
			Err(e) => Err(e),
		},
	};
	match intact {
		Ok(true) => Ok(()),
		Ok(false) => Err(AppError::Auth(format!(
			"the keyring changed {name} on write"
		))),
		Err(e) => Err(AppError::Auth(e.to_string())),
	}
}

#[cfg(any(
	target_os = "linux",
	all(target_os = "macos", not(feature = "keychain"))
))]
fn discard_file_store(store: &CredentialStore) -> std::io::Result<()> {
	store
		.as_any()
		.downcast_ref::<super::file_store::FileStore>()
		.ok_or_else(|| {
			std::io::Error::other("the fallback is not the file store")
		})?
		.discard()
}

#[cfg(any(
	target_os = "android",
	target_os = "ios",
	target_os = "windows",
	all(target_os = "macos", feature = "keychain")
))]
fn discard_file_store(_: &CredentialStore) -> std::io::Result<()> {
	Err(std::io::ErrorKind::Unsupported.into())
}

#[cfg(all(
	test,
	any(
		target_os = "linux",
		all(target_os = "macos", not(feature = "keychain"))
	)
))]
mod tests {
	use std::path::Path;
	use std::sync::Arc;

	use keyring_core::mock;

	use super::*;
	use crate::storage::test_support::{
		install_mock, refuse_next_call, with_file_store,
	};
	use crate::storage::{init_file_store, probe_keyring, StorageBackend};

	type SignIn = [Option<Vec<u8>>; 3];

	struct Stores {
		files: Arc<CredentialStore>,
		keyring: Arc<mock::Store>,
	}

	impl Stores {
		fn probe(&self) -> StorageBackend {
			probe_keyring(install_mock(&self.keyring))
		}

		fn files_hold_no_sign_in(&self) -> bool {
			[FALLBACK_MARKER, SIGN_OUT_MARKER, SESSION]
				.into_iter()
				.all(|name| get(&*self.files, name).is_none())
		}

		fn files_are_empty(&self) -> bool {
			self.files_hold_no_sign_in()
				&& [DEVICE_INFO, SIGNING_KEY]
					.into_iter()
					.all(|name| get(&*self.files, name).is_none())
		}
	}

	fn with_stores(test: impl FnOnce(&Path, Stores)) {
		with_file_store(|base| {
			test(
				base,
				Stores {
					files: keyring_core::get_default_store().unwrap(),
					keyring: mock::Store::new().unwrap(),
				},
			);
		});
	}

	fn put(store: &CredentialStore, name: &str, secret: &[u8]) {
		store
			.build(SERVICE, name, None)
			.unwrap()
			.set_secret(secret)
			.unwrap();
	}

	fn get(store: &CredentialStore, name: &str) -> Option<Vec<u8>> {
		match store.build(SERVICE, name, None).unwrap().get_secret() {
			Ok(secret) => Some(secret),
			Err(Error::NoEntry) => None,
			Err(e) => panic!("{name}: {e}"),
		}
	}

	fn signed_in_as(owner: &str) -> SignIn {
		[" session", " device", " key"]
			.map(|part| Some(format!("{owner}{part}").into_bytes()))
	}

	fn sign_in(store: &CredentialStore, owner: &str) {
		let names = [SESSION, DEVICE_INFO, SIGNING_KEY];
		for (name, secret) in names.into_iter().zip(signed_in_as(owner)) {
			put(store, name, &secret.unwrap());
		}
	}

	fn sign_in_of(store: &CredentialStore) -> SignIn {
		[SESSION, DEVICE_INFO, SIGNING_KEY].map(|name| get(store, name))
	}

	#[test]
	fn a_sign_in_kept_in_the_file_store_moves_into_a_working_keyring() {
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			sign_in(&*stores.files, "file");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("file"));
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn a_sign_in_from_a_fallback_launch_survives_the_next_keyring_launch() {
		with_stores(|base, stores| {
			sign_in(&*stores.keyring, "keyring");
			let fallback = probe_keyring(|| Err("locked".to_owned()));
			sign_in(&*stores.files, "file");

			init_file_store(base.to_path_buf());
			let next = stores.probe();

			assert_eq!(fallback, StorageBackend::File);
			assert_eq!(next, StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("file"));
		});
	}

	#[test]
	fn a_fallback_launch_that_never_signed_in_leaves_the_keyring_sign_in_alone()
	{
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			put(&*stores.files, DEVICE_INFO, b"throwaway device");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("keyring"));
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn a_sign_out_on_a_fallback_launch_also_signs_the_keyring_out() {
		with_stores(|base, stores| {
			sign_in(&*stores.keyring, "keyring");
			probe_keyring(|| Err("locked".to_owned()));
			put(&*stores.files, DEVICE_INFO, b"rotated device");
			remember_sign_out();

			init_file_store(base.to_path_buf());
			let next = stores.probe();

			assert_eq!(next, StorageBackend::Keyring);
			assert_eq!(
				sign_in_of(&*stores.keyring),
				[None, Some(b"rotated device".to_vec()), None]
			);
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn a_sign_out_on_a_keyring_launch_leaves_no_marker_behind() {
		with_stores(|_, stores| {
			assert_eq!(stores.probe(), StorageBackend::Keyring);

			remember_sign_out();

			assert_eq!(get(&*stores.keyring, SIGN_OUT_MARKER), None);
		});
	}

	#[test]
	fn a_sign_in_left_by_an_older_build_loses_to_the_keyring_sign_in() {
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");
			sign_in(&*stores.files, "file");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("keyring"));
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn a_sign_in_left_by_an_older_build_moves_into_a_signed_out_keyring() {
		with_stores(|_, stores| {
			sign_in(&*stores.files, "file");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("file"));
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn a_device_left_by_an_older_build_never_moves_into_the_keyring() {
		with_stores(|_, stores| {
			put(&*stores.keyring, DEVICE_INFO, b"keyring device");
			put(&*stores.files, DEVICE_INFO, b"stray device");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), [None, None, None]);
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn a_moved_sign_in_without_a_signing_key_drops_the_keyrings_old_one() {
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			put(&*stores.files, SESSION, b"file session");
			put(&*stores.files, DEVICE_INFO, b"file device");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(
				sign_in_of(&*stores.keyring),
				[
					Some(b"file session".to_vec()),
					Some(b"file device".to_vec()),
					None
				]
			);
		});
	}

	#[test]
	fn a_keyring_that_refuses_the_move_leaves_the_file_store_in_charge() {
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			sign_in(&*stores.files, "file");
			refuse_next_call(&stores.keyring, SIGNING_KEY);

			let backend = stores.probe();
			let in_charge = keyring_core::get_default_store().unwrap();

			assert_eq!(backend, StorageBackend::File);
			assert_eq!(sign_in_of(&*in_charge), signed_in_as("file"));
			assert_eq!(get(&*stores.keyring, SESSION), None);
		});
	}

	#[test]
	fn a_keyring_whose_session_cannot_be_read_leaves_the_file_store_in_charge()
	{
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			put(&*stores.files, DEVICE_INFO, b"throwaway device");
			refuse_next_call(&stores.keyring, SESSION);

			let backend = stores.probe();
			let in_charge = keyring_core::get_default_store().unwrap();

			assert_eq!(backend, StorageBackend::File);
			assert_eq!(
				get(&*in_charge, DEVICE_INFO),
				Some(b"throwaway device".to_vec())
			);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("keyring"));
		});
	}

	#[test]
	fn a_file_store_that_cannot_be_discarded_still_hands_its_sign_in_over() {
		with_stores(|base, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			sign_in(&*stores.files, "file");
			std::fs::write(base.join("credentials.discarded"), b"").unwrap();

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("file"));
			assert!(stores.files_hold_no_sign_in());
		});
	}

	#[test]
	fn a_signed_out_keyring_gets_a_fresh_device_instead_of_a_stray_one() {
		with_stores(|_, stores| {
			put(&*stores.keyring, DEVICE_INFO, b"keyring device");
			put(&*stores.keyring, SIGNING_KEY, b"keyring key");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			put(&*stores.files, DEVICE_INFO, b"stray device");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), [None, None, None]);
			assert!(stores.files_are_empty());
		});
	}

	#[test]
	fn an_empty_file_store_keeps_a_signed_out_keyrings_device() {
		with_stores(|_, stores| {
			put(&*stores.keyring, DEVICE_INFO, b"keyring device");
			put(&*stores.keyring, SIGNING_KEY, b"keyring key");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(
				sign_in_of(&*stores.keyring),
				[
					None,
					Some(b"keyring device".to_vec()),
					Some(b"keyring key".to_vec())
				]
			);
		});
	}

	#[test]
	fn an_empty_file_store_leaves_the_keyrings_sign_in_alone() {
		with_stores(|_, stores| {
			sign_in(&*stores.keyring, "keyring");

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("keyring"));
		});
	}

	#[test]
	fn a_file_store_that_cannot_be_read_is_left_alone() {
		with_stores(|base, stores| {
			sign_in(&*stores.keyring, "keyring");
			put(&*stores.files, FALLBACK_MARKER, &[]);
			std::fs::create_dir_all(base.join("credentials").join(SESSION))
				.unwrap();

			assert_eq!(stores.probe(), StorageBackend::Keyring);
			assert_eq!(sign_in_of(&*stores.keyring), signed_in_as("keyring"));
			assert_eq!(get(&*stores.files, FALLBACK_MARKER), Some(Vec::new()));
		});
	}
}
