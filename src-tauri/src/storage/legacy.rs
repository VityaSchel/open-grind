use super::entries::{DEVICE_INFO, SESSION, SIGNING_KEY};
use super::STARTUP_PROBE;

const ACCOUNTS: [&str; 4] = [SESSION, DEVICE_INFO, SIGNING_KEY, STARTUP_PROBE];

enum Carried {
	Moved,
	Discarded,
	Unwritten,
}

trait Keychain {
	fn owns_device(&self) -> bool;
	fn legacy_accounts(&self) -> Vec<&'static str>;
	fn read_legacy(&self, account: &str) -> Option<Vec<u8>>;
	fn write(&self, account: &str, secret: &[u8]) -> bool;
	fn remove_legacy(&self, account: &str);
}

#[cfg(all(target_os = "macos", feature = "keychain"))]
pub fn adopt_legacy_items() {
	adopt(&system::Legacy);
}

fn adopt(keychain: &impl Keychain) {
	if keychain.owns_device() {
		return;
	}
	let legacy = keychain.legacy_accounts();
	if legacy.contains(&SESSION)
		&& matches!(carry(keychain, &legacy), Carried::Unwritten)
	{
		return;
	}
	for account in legacy {
		keychain.remove_legacy(account);
	}
}

fn carry(keychain: &impl Keychain, legacy: &[&str]) -> Carried {
	let Some(session) = keychain.read_legacy(SESSION) else {
		return Carried::Discarded;
	};
	let Some(device) = keychain.read_legacy(DEVICE_INFO) else {
		return Carried::Discarded;
	};
	let signing_key = legacy
		.contains(&SIGNING_KEY)
		.then(|| keychain.read_legacy(SIGNING_KEY))
		.flatten();

	let written = signing_key
		.as_ref()
		.is_none_or(|key| keychain.write(SIGNING_KEY, key))
		&& keychain.write(SESSION, &session)
		&& keychain.write(DEVICE_INFO, &device);
	if written {
		Carried::Moved
	} else {
		Carried::Unwritten
	}
}

#[cfg(all(target_os = "macos", feature = "keychain"))]
mod system {
	use security_framework::item::{
		ItemClass, ItemSearchOptions, Limit, Reference, SearchResult,
	};
	use security_framework::os::macos::keychain_item::SecKeychainItem;
	use security_framework::os::macos::passwords::find_generic_password;

	use super::{Keychain, ACCOUNTS, DEVICE_INFO};
	use crate::storage::keyring::{exclusive, SERVICE};

	const LEGACY_SERVICE: &str = "open-grind";

	pub(super) struct Legacy;

	impl Keychain for Legacy {
		fn owns_device(&self) -> bool {
			!items(SERVICE, DEVICE_INFO).is_empty()
		}

		fn legacy_accounts(&self) -> Vec<&'static str> {
			ACCOUNTS
				.into_iter()
				.filter(|account| !items(LEGACY_SERVICE, account).is_empty())
				.collect()
		}

		fn read_legacy(&self, account: &str) -> Option<Vec<u8>> {
			let _exclusive = exclusive();
			find_generic_password(None, LEGACY_SERVICE, account)
				.ok()
				.map(|(secret, _)| secret.to_vec())
		}

		fn write(&self, account: &str, secret: &[u8]) -> bool {
			crate::storage::entry(account)
				.is_ok_and(|entry| entry.set_secret(secret).is_ok())
		}

		fn remove_legacy(&self, account: &str) {
			for item in items(LEGACY_SERVICE, account) {
				let _exclusive = exclusive();
				item.delete();
			}
		}
	}

	fn items(service: &str, account: &str) -> Vec<SecKeychainItem> {
		let _exclusive = exclusive();
		ItemSearchOptions::new()
			.class(ItemClass::generic_password())
			.service(service)
			.account(account)
			.load_refs(true)
			.limit(Limit::All)
			.search()
			.unwrap_or_default()
			.into_iter()
			.filter_map(|result| match result {
				SearchResult::Ref(Reference::KeychainItem(item)) => Some(item),
				_ => None,
			})
			.collect()
	}
}

#[cfg(test)]
mod tests {
	use std::cell::RefCell;
	use std::collections::BTreeMap;

	use super::*;

	#[derive(Default)]
	struct FakeKeychain {
		current: RefCell<BTreeMap<&'static str, Vec<u8>>>,
		legacy: RefCell<BTreeMap<&'static str, Vec<u8>>>,
		declined: Vec<&'static str>,
		unwritable: Vec<&'static str>,
		prompts: RefCell<Vec<String>>,
		events: RefCell<Vec<String>>,
	}

	impl FakeKeychain {
		fn with_legacy(accounts: &[&'static str]) -> Self {
			let keychain = Self::default();
			for account in accounts {
				keychain
					.legacy
					.borrow_mut()
					.insert(account, format!("legacy {account}").into_bytes());
			}
			keychain
		}

		fn own(&self, account: &'static str) {
			self.current
				.borrow_mut()
				.insert(account, format!("own {account}").into_bytes());
		}

		fn current(&self, account: &str) -> Option<String> {
			self.current
				.borrow()
				.get(account)
				.map(|secret| String::from_utf8(secret.clone()).unwrap())
		}

		fn legacy_left(&self) -> Vec<&'static str> {
			self.legacy.borrow().keys().copied().collect()
		}
	}

	impl Keychain for FakeKeychain {
		fn owns_device(&self) -> bool {
			self.current.borrow().contains_key(DEVICE_INFO)
		}

		fn legacy_accounts(&self) -> Vec<&'static str> {
			ACCOUNTS
				.into_iter()
				.filter(|account| self.legacy.borrow().contains_key(account))
				.collect()
		}

		fn read_legacy(&self, account: &str) -> Option<Vec<u8>> {
			self.prompts.borrow_mut().push(account.to_owned());
			if self.declined.contains(&account) {
				return None;
			}
			self.legacy.borrow().get(account).cloned()
		}

		fn write(&self, account: &str, secret: &[u8]) -> bool {
			if self.unwritable.contains(&account) {
				return false;
			}
			let account = ACCOUNTS.into_iter().find(|a| *a == account).unwrap();
			self.events.borrow_mut().push(format!("write {account}"));
			self.current.borrow_mut().insert(account, secret.to_vec());
			true
		}

		fn remove_legacy(&self, account: &str) {
			self.events.borrow_mut().push(format!("remove {account}"));
			self.legacy.borrow_mut().remove(account);
		}
	}

	#[test]
	fn a_legacy_session_moves_with_its_device_and_signing_key() {
		let keychain =
			FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO, SIGNING_KEY]);

		adopt(&keychain);

		assert_eq!(keychain.current(SESSION).unwrap(), "legacy session");
		assert_eq!(
			keychain.current(DEVICE_INFO).unwrap(),
			"legacy device-info"
		);
		assert_eq!(
			keychain.current(SIGNING_KEY).unwrap(),
			"legacy device-signing-key"
		);
		assert!(keychain.legacy_left().is_empty());
	}

	#[test]
	fn each_legacy_secret_is_read_once() {
		let keychain =
			FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO, SIGNING_KEY]);

		adopt(&keychain);

		assert_eq!(
			*keychain.prompts.borrow(),
			[SESSION, DEVICE_INFO, SIGNING_KEY]
		);
	}

	#[test]
	fn the_legacy_items_are_removed_only_after_the_device_is_written() {
		let keychain = FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO]);

		adopt(&keychain);

		assert_eq!(
			*keychain.events.borrow(),
			[
				"write session",
				"write device-info",
				"remove session",
				"remove device-info"
			]
		);
	}

	#[test]
	fn an_app_with_its_own_session_never_reads_the_legacy_items() {
		let keychain = FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO]);
		keychain.own(DEVICE_INFO);
		keychain.own(SESSION);

		adopt(&keychain);

		assert!(keychain.prompts.borrow().is_empty());
		assert_eq!(keychain.legacy_left(), [DEVICE_INFO, SESSION]);
		assert_eq!(keychain.current(SESSION).unwrap(), "own session");
	}

	#[test]
	fn signing_out_never_brings_a_legacy_session_back() {
		let keychain = FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO]);
		keychain.own(DEVICE_INFO);

		adopt(&keychain);

		assert!(keychain.prompts.borrow().is_empty());
		assert_eq!(keychain.legacy_left(), [DEVICE_INFO, SESSION]);
		assert_eq!(keychain.current(SESSION), None);
		assert_eq!(keychain.current(DEVICE_INFO).unwrap(), "own device-info");
	}

	#[test]
	fn without_a_legacy_session_nothing_is_read_and_the_rest_is_removed() {
		let keychain = FakeKeychain::with_legacy(&[
			DEVICE_INFO,
			SIGNING_KEY,
			STARTUP_PROBE,
		]);

		adopt(&keychain);

		assert!(keychain.prompts.borrow().is_empty());
		assert!(keychain.legacy_left().is_empty());
		assert!(keychain.current.borrow().is_empty());
	}

	#[test]
	fn declining_the_session_stops_asking_and_discards_every_legacy_item() {
		let keychain = FakeKeychain {
			declined: vec![SESSION],
			..FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO, SIGNING_KEY])
		};

		adopt(&keychain);

		assert_eq!(*keychain.prompts.borrow(), [SESSION]);
		assert!(keychain.legacy_left().is_empty());
		assert!(keychain.current.borrow().is_empty());
	}

	#[test]
	fn declining_the_device_discards_the_session_with_it() {
		let keychain = FakeKeychain {
			declined: vec![DEVICE_INFO],
			..FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO, SIGNING_KEY])
		};

		adopt(&keychain);

		assert_eq!(*keychain.prompts.borrow(), [SESSION, DEVICE_INFO]);
		assert!(keychain.legacy_left().is_empty());
		assert!(keychain.current.borrow().is_empty());
	}

	#[test]
	fn declining_the_signing_key_still_moves_the_session() {
		let keychain = FakeKeychain {
			declined: vec![SIGNING_KEY],
			..FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO, SIGNING_KEY])
		};

		adopt(&keychain);

		assert_eq!(keychain.current(SESSION).unwrap(), "legacy session");
		assert_eq!(keychain.current(SIGNING_KEY), None);
		assert!(keychain.legacy_left().is_empty());
	}

	#[test]
	fn a_failed_write_keeps_every_legacy_item_for_the_next_launch() {
		let keychain = FakeKeychain {
			unwritable: vec![SESSION],
			..FakeKeychain::with_legacy(&[SESSION, DEVICE_INFO])
		};

		adopt(&keychain);

		assert_eq!(keychain.legacy_left(), [DEVICE_INFO, SESSION]);
		assert!(!keychain.owns_device());
	}
}
