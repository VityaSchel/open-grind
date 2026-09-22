use super::error::UpdateError;
use super::install;

pub const APP_KEY: &str = "app";
pub const SELF_PACKAGE: &str = "org.opengrind";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
	ThisApp,
	Package(&'static str),
}

pub struct Component {
	pub key: &'static str,
	pub index_path: &'static str,
	pub asset_stem: &'static str,
	pub asset_suffix: fn() -> Option<String>,
	pub target: Target,
}

impl Component {
	pub fn is_self(&self) -> bool {
		matches!(self.target, Target::ThisApp)
	}

	pub fn package(&self) -> Option<&'static str> {
		match self.target {
			Target::ThisApp => None,
			Target::Package(name) => Some(name),
		}
	}

	pub fn install_target(&self) -> &'static str {
		self.package().unwrap_or(SELF_PACKAGE)
	}

	pub fn payload_name(&self, tag: &str, suffix: &str) -> String {
		format!("{}-{tag}{suffix}", self.asset_stem)
	}
}

pub static APP: Component = Component {
	key: APP_KEY,
	index_path:
		"api/v1/repos/open-grind/open-grind/releases?limit=3&draft=false",
	asset_stem: "open-grind",
	asset_suffix: install::release_asset_suffix,
	target: Target::ThisApp,
};

pub static GOOGLE_OAUTH: Component = Component {
	key: "google-oauth",
	index_path:
		"api/v1/repos/open-grind/google-oauth-app/releases?limit=3&draft=false",
	asset_stem: "open-grind-google-oauth",
	asset_suffix: abi_asset_suffix,
	target: Target::Package("org.opengrind.google_oauth"),
};

pub static RECAPTCHA: Component = Component {
	key: "recaptcha",
	index_path:
		"api/v1/repos/open-grind/recaptcha-helper/releases?limit=3&draft=false",
	asset_stem: "open-grind-recaptcha-helper",
	asset_suffix: universal_asset_suffix,
	target: Target::Package("org.opengrind.recaptcha"),
};

pub static FCM: Component = Component {
	key: "fcm",
	index_path:
		"api/v1/repos/open-grind/fcm-service/releases?limit=3&draft=false",
	asset_stem: "open-grind-fcm-service",
	asset_suffix: universal_asset_suffix,
	target: Target::Package("org.opengrind.fcm"),
};

pub static ALL: &[&Component] = &[&APP, &GOOGLE_OAUTH, &RECAPTCHA, &FCM];

fn abi_asset_suffix() -> Option<String> {
	abi_token(std::env::consts::OS, std::env::consts::ARCH).map(str::to_owned)
}

fn universal_asset_suffix() -> Option<String> {
	universal_token(std::env::consts::OS).map(str::to_owned)
}

pub(super) fn abi_token(os: &str, arch: &str) -> Option<&'static str> {
	if os != "android" {
		return None;
	}
	match arch {
		"aarch64" => Some("-arm64-v8a.apk"),
		"arm" => Some("-v7a.apk"),
		"x86_64" => Some("-x86_64.apk"),
		_ => None,
	}
}

pub(super) fn universal_token(os: &str) -> Option<&'static str> {
	(os == "android").then_some("-android.apk")
}

pub fn by_key(key: &str) -> Result<&'static Component, UpdateError> {
	ALL.iter()
		.copied()
		.find(|component| component.key == key)
		.ok_or_else(|| UpdateError::UnknownComponent(key.to_owned()))
}

pub fn is_known_key(key: &str) -> bool {
	ALL.iter().any(|component| component.key == key)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn every_index_path_is_a_relative_path_with_a_query_string() {
		for component in ALL {
			assert!(
				component.index_path.contains('?'),
				"{} index_path must already have a query string, because \
				 fetch_index appends its channel filter with '&'",
				component.key
			);
			assert!(
				!component.index_path.starts_with('/')
					&& !component.index_path.contains("://"),
				"{} index_path is joined onto the pinned origin, so it must \
				 not be able to name a host of its own",
				component.key
			);
		}
	}

	#[test]
	fn no_component_key_could_be_mistaken_for_a_release_tag() {
		for component in ALL {
			assert!(
				semver::Version::parse(
					component.key.strip_prefix('v').unwrap_or(component.key)
				)
				.is_err(),
				"{} parses as a version",
				component.key
			);
		}
	}

	#[test]
	fn keys_are_unique_and_usable_as_directory_names() {
		let mut seen = Vec::new();
		for component in ALL {
			assert!(
				!seen.contains(&component.key),
				"duplicate component key {}",
				component.key
			);
			assert!(
				component
					.key
					.chars()
					.all(|c| c.is_ascii_alphanumeric() || c == '-'),
				"{} is not a safe directory name",
				component.key
			);
			seen.push(component.key);
		}
	}

	#[test]
	fn an_unknown_key_is_rejected_rather_than_defaulted() {
		assert!(by_key("app").is_ok());
		assert!(by_key("").is_err());
		assert!(by_key("../escape").is_err());
		assert!(by_key("APP").is_err());
	}

	#[test]
	fn the_app_targets_itself_and_names_no_package() {
		assert!(APP.is_self());
		assert_eq!(APP.package(), None);
	}

	#[test]
	fn the_self_package_matches_the_bundle_identifier() {
		const CONF: &str = include_str!("../../../tauri.conf.json");
		let declared = CONF
			.lines()
			.find(|line| line.contains("\"identifier\""))
			.and_then(|line| line.split('"').nth(3))
			.expect("tauri.conf.json declares an identifier");
		assert_eq!(declared, SELF_PACKAGE);
		assert_eq!(APP.install_target(), SELF_PACKAGE);
		assert_eq!(GOOGLE_OAUTH.install_target(), "org.opengrind.google_oauth");
	}

	#[test]
	fn the_google_oauth_addon_targets_a_package_that_is_not_us() {
		assert!(!GOOGLE_OAUTH.is_self());
		assert_eq!(GOOGLE_OAUTH.package(), Some("org.opengrind.google_oauth"));
		assert_ne!(GOOGLE_OAUTH.package(), APP.package());
	}

	#[test]
	fn every_component_names_a_distinct_asset_stem() {
		let mut stems: Vec<&str> = ALL.iter().map(|c| c.asset_stem).collect();
		let before = stems.len();
		stems.sort_unstable();
		stems.dedup();
		assert_eq!(stems.len(), before);
	}

	#[test]
	fn the_google_oauth_abi_tokens_match_what_the_signer_publishes() {
		assert_eq!(abi_token("android", "aarch64"), Some("-arm64-v8a.apk"));
		assert_eq!(abi_token("android", "arm"), Some("-v7a.apk"));
		assert_eq!(abi_token("android", "x86_64"), Some("-x86_64.apk"));
	}

	#[test]
	fn an_abi_the_google_oauth_addon_does_not_publish_has_no_asset() {
		assert_eq!(abi_token("android", "x86"), None);
		assert_eq!(abi_token("android", "riscv64"), None);
	}

	#[test]
	fn the_recaptcha_helper_ships_one_apk_for_all_abis() {
		assert_eq!(universal_token("android"), Some("-android.apk"));
		for os in ["linux", "macos", "windows", "ios"] {
			assert_eq!(universal_token(os), None);
		}
	}

	#[test]
	fn the_google_oauth_addon_is_android_only() {
		for os in ["linux", "macos", "windows", "ios"] {
			assert_eq!(abi_token(os, "x86_64"), None);
			assert_eq!(abi_token(os, "aarch64"), None);
		}
	}

	#[test]
	fn the_recaptcha_addon_is_its_own_package_and_release_track() {
		assert!(!RECAPTCHA.is_self());
		assert_eq!(RECAPTCHA.install_target(), "org.opengrind.recaptcha");
		assert_eq!(
			RECAPTCHA.index_path,
			"api/v1/repos/open-grind/recaptcha-helper/releases?limit=3&draft=false"
		);
		assert_eq!(
			RECAPTCHA
				.payload_name("v1.0.0", universal_token("android").unwrap()),
			"open-grind-recaptcha-helper-v1.0.0-android.apk"
		);
	}

	#[test]
	fn the_fcm_addon_is_its_own_package_and_release_track() {
		assert!(!FCM.is_self());
		assert_eq!(FCM.install_target(), "org.opengrind.fcm");
		assert_eq!(
			FCM.index_path,
			"api/v1/repos/open-grind/fcm-service/releases?limit=3&draft=false"
		);
		assert_eq!(
			FCM.payload_name("v1.0.1", universal_token("android").unwrap()),
			"open-grind-fcm-service-v1.0.1-android.apk"
		);
	}

	#[test]
	fn the_published_names_compose_into_the_assets_that_exist() {
		assert_eq!(
			GOOGLE_OAUTH.payload_name(
				"v1.1.0",
				abi_token("android", "aarch64").unwrap()
			),
			"open-grind-google-oauth-v1.1.0-arm64-v8a.apk"
		);
		assert_eq!(
			GOOGLE_OAUTH
				.payload_name("v1.1.0", abi_token("android", "arm").unwrap()),
			"open-grind-google-oauth-v1.1.0-v7a.apk"
		);
		assert_eq!(
			APP.payload_name("v0.2.0", "-android.apk"),
			"open-grind-v0.2.0-android.apk"
		);
	}
}
