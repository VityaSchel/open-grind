use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::error::AppError;

const SERVICE: &str = "open-grind";

static KEYRING_LOCK: Mutex<()> = Mutex::new(());

pub(crate) struct Entry(keyring_core::Entry);

pub(crate) fn entry(name: &str) -> Result<Entry, AppError> {
	keyring_core::Entry::new(SERVICE, name)
		.map(Entry)
		.map_err(|e| AppError::Auth(e.to_string()))
}

impl Entry {
	pub(crate) fn get_secret(&self) -> keyring_core::Result<Vec<u8>> {
		let _exclusive = exclusive();
		self.0.get_secret()
	}

	pub(crate) fn set_secret(&self, secret: &[u8]) -> keyring_core::Result<()> {
		let _exclusive = exclusive();
		self.0.set_secret(secret)
	}

	pub(crate) fn delete_credential(&self) -> keyring_core::Result<()> {
		let _exclusive = exclusive();
		self.0.delete_credential()
	}
}

fn exclusive() -> MutexGuard<'static, ()> {
	KEYRING_LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
	use std::any::Any;
	use std::sync::{Arc, Barrier, Mutex};
	use std::time::Duration;

	use keyring_core::api::CredentialApi;
	use keyring_core::{Credential, Result};

	use super::Entry;

	#[derive(Default)]
	struct OverlapProbe(Mutex<()>);

	impl OverlapProbe {
		fn visit<T>(&self, result: T) -> T {
			let _visiting = self
				.0
				.try_lock()
				.expect("another keyring call is already running");
			std::thread::sleep(Duration::from_millis(20));
			result
		}
	}

	impl CredentialApi for OverlapProbe {
		fn set_secret(&self, _: &[u8]) -> Result<()> {
			self.visit(Ok(()))
		}

		fn get_secret(&self) -> Result<Vec<u8>> {
			self.visit(Ok(Vec::new()))
		}

		fn delete_credential(&self) -> Result<()> {
			self.visit(Ok(()))
		}

		fn get_credential(&self) -> Result<Option<Arc<Credential>>> {
			Ok(None)
		}

		fn get_specifiers(&self) -> Option<(String, String)> {
			None
		}

		fn as_any(&self) -> &dyn Any {
			self
		}
	}

	#[test]
	fn keyring_operations_from_many_threads_never_overlap() {
		let probe = Arc::new(OverlapProbe::default());
		let start = &Barrier::new(8);

		std::thread::scope(|scope| {
			for thread in 0..8 {
				let entry = Entry(keyring_core::Entry::new_with_credential(
					probe.clone(),
				));
				scope.spawn(move || {
					start.wait();
					match thread % 3 {
						0 => entry.delete_credential(),
						1 => entry.get_secret().map(drop),
						_ => entry.set_secret(b"secret"),
					}
				});
			}
		});
	}
}
