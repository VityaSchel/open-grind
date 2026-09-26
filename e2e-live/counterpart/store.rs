use std::fmt;
use std::path::PathBuf;

use grindr::{Credentials, DeviceInfo, GrindrClient, Session};
use serde::Deserialize;

use crate::guard::{ensure_live_account, GuardError};

#[derive(Debug)]
pub enum StoreError {
	Guard(GuardError),
	NoHomeDirectory,
	Unreadable,
	Malformed,
	AccountMissing(u64),
	ClientRejected,
}

impl fmt::Display for StoreError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::Guard(error) => error.fmt(f),
			Self::NoHomeDirectory => f.write_str("HOME is not set"),
			Self::Unreadable => f.write_str("the dev-tool store is unreadable"),
			Self::Malformed => f.write_str("the dev-tool store is malformed"),
			Self::AccountMissing(id) => {
				write!(f, "{id} is not in the dev-tool store")
			}
			Self::ClientRejected => {
				f.write_str("the stored device could not build a client")
			}
		}
	}
}

#[derive(Deserialize)]
struct Store {
	accounts: Vec<StoredAccount>,
}

#[derive(Deserialize)]
struct StoredAccount {
	device: DeviceInfo,
	session: Credentials,
}

fn store_path() -> Result<PathBuf, StoreError> {
	let home = std::env::var_os("HOME").ok_or(StoreError::NoHomeDirectory)?;
	Ok(PathBuf::from(home).join(
		"Library/Application Support/org.opengrind.devtool/accounts.json",
	))
}

pub fn client_for(profile_id: u64) -> Result<GrindrClient, StoreError> {
	ensure_live_account(profile_id).map_err(StoreError::Guard)?;
	let raw =
		std::fs::read(store_path()?).map_err(|_| StoreError::Unreadable)?;
	let store: Store =
		serde_json::from_slice(&raw).map_err(|_| StoreError::Malformed)?;
	let wanted = profile_id.to_string();
	let account = store
		.accounts
		.into_iter()
		.find(|account| {
			account.session.profile_id.as_deref() == Some(wanted.as_str())
		})
		.ok_or(StoreError::AccountMissing(profile_id))?;
	GrindrClient::new(
		account.device,
		Some(Session {
			credentials: account.session,
			token: None,
		}),
	)
	.map_err(|_| StoreError::ClientRejected)
}
