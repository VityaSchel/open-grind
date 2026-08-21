#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
pub use android::AndroidUpdater;
#[cfg(not(target_os = "android"))]
mod desktop;

use serde::{Deserialize, Serialize};

use super::error::UpdateError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "reason",
	content = "detail"
)]
pub enum Unsupported {
	ExternallyManaged { installer: String },
	ForeignSigner,
	Undetermined,
	NoReleaseArtifacts { target: String },
	Sandboxed { runtime: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "state",
	content = "detail"
)]
pub enum Capability {
	Supported {
		payload_suffix: String,
		can_install_now: bool,
	},
	Unsupported(Unsupported),
}

impl Capability {
	pub fn require(self) -> Result<String, UpdateError> {
		match self {
			Capability::Supported { payload_suffix, .. } => Ok(payload_suffix),
			Capability::Unsupported(reason) => {
				Err(UpdateError::Unsupported(reason))
			}
		}
	}
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
	pub succeeded: bool,
	#[serde(default)]
	pub canceled: bool,
	pub code: Option<i32>,
	pub message: Option<String>,
}

pub fn release_asset_suffix() -> Option<String> {
	let arch = match std::env::consts::ARCH {
		"aarch64" => "arm64",
		other => other,
	};
	match std::env::consts::OS {
		"android" => Some("-android.apk".to_owned()),
		"macos" => Some(format!("-macos-{arch}.zip")),
		"windows" => Some(format!("-windows-{arch}.exe")),
		_ => None,
	}
}

#[cfg(target_os = "android")]
use android as platform;
#[cfg(not(target_os = "android"))]
use desktop as platform;

pub use platform::{
	capability, enforce_home, hold_process, install,
	open_install_permission_settings, sweep_replaced, take_outcome,
	watch_install,
};
