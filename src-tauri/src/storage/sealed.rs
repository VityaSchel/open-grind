use std::any::Any;
use std::collections::HashMap;
use std::sync::Arc;

use boring2::error::ErrorStack;
use boring2::symm::{decrypt_aead, encrypt_aead, Cipher};
use keyring_core::api::{
	CredentialApi, CredentialPersistence, CredentialStoreApi,
};
use keyring_core::{Credential, CredentialStore, Entry, Error, Result};

const FORMAT: u8 = 1;
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub(super) struct SealingKey([u8; KEY_LEN]);

impl SealingKey {
	pub(super) fn generate() -> Self {
		let mut key = [0u8; KEY_LEN];
		getrandom::fill(&mut key).expect("system randomness unavailable");
		Self(key)
	}

	pub(super) fn from_bytes(bytes: &[u8]) -> Option<Self> {
		bytes.try_into().ok().map(Self)
	}

	pub(super) fn as_bytes(&self) -> &[u8] {
		&self.0
	}

	fn seal(
		&self,
		account: &str,
		secret: &[u8],
	) -> std::result::Result<Vec<u8>, ErrorStack> {
		let mut nonce = [0u8; NONCE_LEN];
		getrandom::fill(&mut nonce).expect("system randomness unavailable");
		let mut tag = [0u8; TAG_LEN];
		let ciphertext = encrypt_aead(
			Cipher::aes_256_gcm(),
			&self.0,
			Some(&nonce),
			&associated_data(account),
			secret,
			&mut tag,
		)?;
		let mut sealed =
			Vec::with_capacity(1 + NONCE_LEN + TAG_LEN + ciphertext.len());
		sealed.push(FORMAT);
		sealed.extend_from_slice(&nonce);
		sealed.extend_from_slice(&tag);
		sealed.extend_from_slice(&ciphertext);
		Ok(sealed)
	}

	fn open(&self, account: &str, sealed: &[u8]) -> Option<Vec<u8>> {
		let (&format, rest) = sealed.split_first()?;
		if format != FORMAT || rest.len() < NONCE_LEN + TAG_LEN {
			return None;
		}
		let (nonce, rest) = rest.split_at(NONCE_LEN);
		let (tag, ciphertext) = rest.split_at(TAG_LEN);
		decrypt_aead(
			Cipher::aes_256_gcm(),
			&self.0,
			Some(nonce),
			&associated_data(account),
			ciphertext,
			tag,
		)
		.ok()
	}
}

fn associated_data(account: &str) -> Vec<u8> {
	let mut data = vec![FORMAT];
	data.extend_from_slice(account.as_bytes());
	data
}

pub(super) struct SealedStore {
	inner: Arc<CredentialStore>,
	key: Arc<SealingKey>,
}

impl SealedStore {
	pub(super) fn new(inner: Arc<CredentialStore>, key: SealingKey) -> Self {
		Self {
			inner,
			key: Arc::new(key),
		}
	}
}

impl CredentialStoreApi for SealedStore {
	fn vendor(&self) -> String {
		format!("{}, sealed by open-grind", self.inner.vendor())
	}

	fn id(&self) -> String {
		self.inner.id()
	}

	fn build(
		&self,
		service: &str,
		user: &str,
		modifiers: Option<&HashMap<&str, &str>>,
	) -> Result<Entry> {
		let sealed = SealedCredential {
			inner: self.inner.build(service, user, modifiers)?,
			account: user.to_owned(),
			key: self.key.clone(),
		};
		Ok(Entry::new_with_credential(Arc::new(sealed)))
	}

	fn persistence(&self) -> CredentialPersistence {
		self.inner.persistence()
	}

	fn as_any(&self) -> &dyn Any {
		self
	}
}

struct SealedCredential {
	inner: Entry,
	account: String,
	key: Arc<SealingKey>,
}

impl CredentialApi for SealedCredential {
	fn set_secret(&self, secret: &[u8]) -> Result<()> {
		let sealed = self
			.key
			.seal(&self.account, secret)
			.map_err(|e| Error::PlatformFailure(Box::new(e)))?;
		self.inner.set_secret(&sealed)
	}

	fn get_secret(&self) -> Result<Vec<u8>> {
		let sealed = self.inner.get_secret()?;
		self.key.open(&self.account, &sealed).ok_or(Error::NoEntry)
	}

	fn delete_credential(&self) -> Result<()> {
		self.inner.delete_credential()
	}

	fn get_credential(&self) -> Result<Option<Arc<Credential>>> {
		Ok(None)
	}

	fn get_specifiers(&self) -> Option<(String, String)> {
		self.inner.get_specifiers()
	}

	fn as_any(&self) -> &dyn Any {
		self
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const ACCOUNT: &str = "session";

	fn sealed_store(
		inner: &Arc<keyring_core::mock::Store>,
		key: SealingKey,
	) -> SealedStore {
		SealedStore::new(inner.clone(), key)
	}

	fn twin(key: &SealingKey) -> SealingKey {
		SealingKey::from_bytes(key.as_bytes()).unwrap()
	}

	#[test]
	fn a_secret_survives_a_seal_and_open() {
		let key = SealingKey::generate();
		let sealed = key.seal(ACCOUNT, b"auth-token").unwrap();

		assert_eq!(key.open(ACCOUNT, &sealed).unwrap(), b"auth-token");
		assert_eq!(
			key.open(ACCOUNT, &key.seal(ACCOUNT, b"").unwrap()),
			Some(Vec::new())
		);
	}

	#[test]
	fn the_envelope_is_format_nonce_tag_then_ciphertext() {
		let key = SealingKey::generate();
		let sealed = key.seal(ACCOUNT, b"auth-token").unwrap();

		assert_eq!(sealed[0], FORMAT);
		assert_eq!(
			decrypt_aead(
				Cipher::aes_256_gcm(),
				key.as_bytes(),
				Some(&sealed[1..1 + NONCE_LEN]),
				b"\x01session",
				&sealed[1 + NONCE_LEN + TAG_LEN..],
				&sealed[1 + NONCE_LEN..1 + NONCE_LEN + TAG_LEN],
			)
			.unwrap(),
			b"auth-token"
		);
	}

	#[test]
	fn every_write_draws_a_fresh_nonce() {
		let key = SealingKey::generate();
		let first = key.seal(ACCOUNT, b"auth-token").unwrap();
		let second = key.seal(ACCOUNT, b"auth-token").unwrap();

		assert_ne!(first[1..1 + NONCE_LEN], second[1..1 + NONCE_LEN]);
		assert_ne!(first, second);
	}

	#[test]
	fn a_tampered_envelope_is_rejected() {
		let key = SealingKey::generate();
		let sealed = key.seal(ACCOUNT, b"auth-token").unwrap();

		for index in 1..sealed.len() {
			let mut tampered = sealed.clone();
			tampered[index] ^= 0x01;
			assert_eq!(key.open(ACCOUNT, &tampered), None, "byte {index}");
		}
	}

	#[test]
	fn another_key_cannot_open_the_envelope() {
		let sealed =
			SealingKey::generate().seal(ACCOUNT, b"auth-token").unwrap();

		assert_eq!(SealingKey::generate().open(ACCOUNT, &sealed), None);
	}

	#[test]
	fn an_envelope_sealed_for_one_account_does_not_open_as_another() {
		let key = SealingKey::generate();
		let sealed = key.seal("device-signing-key", b"private key").unwrap();

		assert_eq!(key.open(ACCOUNT, &sealed), None);
	}

	#[test]
	fn an_envelope_too_short_to_hold_a_nonce_and_tag_is_rejected() {
		let key = SealingKey::generate();
		let sealed = key.seal(ACCOUNT, b"").unwrap();

		for length in 0..sealed.len() {
			assert_eq!(
				key.open(ACCOUNT, &sealed[..length]),
				None,
				"{length} bytes"
			);
		}
	}

	#[test]
	fn an_unknown_format_byte_is_rejected() {
		let key = SealingKey::generate();
		let mut sealed = key.seal(ACCOUNT, b"auth-token").unwrap();

		for format in [0, 2, 0xff] {
			sealed[0] = format;
			assert_eq!(key.open(ACCOUNT, &sealed), None, "format {format}");
		}
	}

	#[test]
	fn plaintext_from_before_sealing_reads_as_absent() {
		let key = SealingKey::generate();

		assert_eq!(
			key.open(ACCOUNT, b"\x81\xa5email\xb0user@example.com"),
			None
		);
	}

	#[test]
	fn a_key_must_be_exactly_32_bytes() {
		assert!(SealingKey::from_bytes(&[7; 32]).is_some());
		for length in [0, 16, 31, 33, 64] {
			assert!(SealingKey::from_bytes(&vec![7; length]).is_none());
		}
	}

	#[test]
	fn the_store_writes_only_ciphertext_to_the_keychain() {
		let keychain = keyring_core::mock::Store::new().unwrap();
		let store = sealed_store(&keychain, SealingKey::generate());

		store
			.build("svc", ACCOUNT, None)
			.unwrap()
			.set_secret(b"auth-token")
			.unwrap();

		let stored = keychain
			.build("svc", ACCOUNT, None)
			.unwrap()
			.get_secret()
			.unwrap();
		assert_eq!(stored[0], FORMAT);
		assert!(!stored
			.windows(b"auth-token".len())
			.any(|w| w == b"auth-token"));
		assert_eq!(
			store
				.build("svc", ACCOUNT, None)
				.unwrap()
				.get_secret()
				.unwrap(),
			b"auth-token"
		);
	}

	#[test]
	fn a_secret_sealed_by_a_previous_install_reads_as_no_entry() {
		let keychain = keyring_core::mock::Store::new().unwrap();
		sealed_store(&keychain, SealingKey::generate())
			.build("svc", ACCOUNT, None)
			.unwrap()
			.set_secret(b"auth-token")
			.unwrap();

		let reinstalled = sealed_store(&keychain, SealingKey::generate());

		assert!(matches!(
			reinstalled
				.build("svc", ACCOUNT, None)
				.unwrap()
				.get_secret(),
			Err(Error::NoEntry)
		));
	}

	#[test]
	fn the_same_key_reads_secrets_back_after_a_relaunch() {
		let keychain = keyring_core::mock::Store::new().unwrap();
		let key = SealingKey::generate();
		let relaunched = twin(&key);
		sealed_store(&keychain, key)
			.build("svc", ACCOUNT, None)
			.unwrap()
			.set_secret(b"auth-token")
			.unwrap();

		assert_eq!(
			sealed_store(&keychain, relaunched)
				.build("svc", ACCOUNT, None)
				.unwrap()
				.get_secret()
				.unwrap(),
			b"auth-token"
		);
	}

	#[test]
	fn deleting_through_the_store_removes_the_keychain_item() {
		let keychain = keyring_core::mock::Store::new().unwrap();
		let store = sealed_store(&keychain, SealingKey::generate());
		let entry = store.build("svc", ACCOUNT, None).unwrap();
		entry.set_secret(b"auth-token").unwrap();

		entry.delete_credential().unwrap();

		assert!(matches!(
			keychain.build("svc", ACCOUNT, None).unwrap().get_secret(),
			Err(Error::NoEntry)
		));
		assert!(matches!(entry.delete_credential(), Err(Error::NoEntry)));
	}
}
