use std::path::PathBuf;

use semver::Version;
use tauri::AppHandle;

use super::error::UpdateError;
use super::{install, storage};

pub(super) struct Session {
	pub(super) root: PathBuf,
	pub(super) current: Version,
	pub(super) payload_suffix: String,
}

impl Session {
	pub(super) fn open(app: &AppHandle) -> Result<Self, UpdateError> {
		let payload_suffix = install::capability(app).require()?;
		Ok(Self {
			root: storage::root(app)?,
			current: super::current_version(app)?,
			payload_suffix,
		})
	}
}
