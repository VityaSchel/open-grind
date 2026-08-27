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
		"macos" => Some("-macos.zip".to_owned()),
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

#[cfg(test)]
mod pins {
	const KEYS: &str = include_str!("../../../../../KEYS.md");
	const GATE: &str = include_str!(
		"../../../../android-logic/src/main/kotlin/org/opengrind/update/InstallGate.kt"
	);
	const MANIFEST: &str = include_str!(
		"../../../../gen/android/app/src/main/AndroidManifest.xml"
	);

	fn hex64(line: &str) -> bool {
		line.len() == 64 && line.chars().all(|c| c.is_ascii_hexdigit())
	}

	#[test]
	fn the_kotlin_signer_pin_matches_the_published_jks_fingerprint() {
		let published = KEYS
			.lines()
			.skip_while(|line| !line.contains("Android JKS"))
			.map(str::trim)
			.find(|line| hex64(line))
			.expect("KEYS.md publishes no Android JKS fingerprint");
		let start = GATE
			.find("RELEASE_CERT_SHA256")
			.expect("pin in InstallGate");
		let literal = GATE[start..]
			.split('"')
			.nth(1)
			.expect("pin holds a string literal");

		assert!(
			literal.eq_ignore_ascii_case(published),
			"pin drifted from KEYS.md"
		);
		assert!(
			literal.chars().all(|c| !c.is_ascii_lowercase()),
			"soleSignerOf emits uppercase hex and the comparison is case-sensitive"
		);
	}

	#[test]
	fn the_update_components_stay_unexported() {
		for component in ["InstallResultReceiver", "TransferService"] {
			let at = MANIFEST.find(component).expect(component);
			let element = &MANIFEST
				[at..MANIFEST[at..].find('>').map(|i| at + i).unwrap()];
			assert!(
				element.contains("android:exported=\"false\""),
				"{component} must not be exported"
			);
		}
	}
}
