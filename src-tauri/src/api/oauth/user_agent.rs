pub enum SignInPage {
	#[cfg(any(target_os = "ios", desktop))]
	Google,
	Facebook,
}

#[cfg(any(target_os = "ios", desktop))]
const MAC_SAFARI: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
	AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

pub fn sign_in_user_agent(page: SignInPage) -> Option<String> {
	#[cfg(target_os = "android")]
	{
		match page {
			SignInPage::Facebook => None,
		}
	}
	#[cfg(target_os = "ios")]
	{
		match page {
			SignInPage::Google => Some(MAC_SAFARI.to_owned()),
			SignInPage::Facebook => Some(iphone_safari(running_ios())),
		}
	}
	#[cfg(desktop)]
	{
		match page {
			SignInPage::Google | SignInPage::Facebook => {
				Some(MAC_SAFARI.to_owned())
			}
		}
	}
}

#[cfg(any(target_os = "ios", test))]
#[derive(Clone, Copy)]
struct IosVersion {
	major: u32,
	minor: u32,
	patch: u32,
}

#[cfg(any(target_os = "ios", test))]
const FROZEN_FROM_MAJOR: u32 = 26;
#[cfg(any(target_os = "ios", test))]
const FROZEN_IN_26_0: &str = "18_6";
#[cfg(any(target_os = "ios", test))]
const FROZEN: &str = "18_7";

#[cfg(any(target_os = "ios", test))]
fn iphone_safari(os: IosVersion) -> String {
	let version = product_version(os);
	let os_token = match os {
		IosVersion {
			major: FROZEN_FROM_MAJOR,
			minor: 0,
			..
		} => FROZEN_IN_26_0.to_owned(),
		IosVersion { major, .. } if major >= FROZEN_FROM_MAJOR => {
			FROZEN.to_owned()
		}
		_ => version.replace('.', "_"),
	};
	format!(
		"Mozilla/5.0 (iPhone; CPU iPhone OS {os_token} like Mac OS X) \
		 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{version} \
		 Mobile/15E148 Safari/604.1"
	)
}

#[cfg(any(target_os = "ios", test))]
fn product_version(os: IosVersion) -> String {
	match os.patch {
		0 => format!("{}.{}", os.major, os.minor),
		patch => format!("{}.{}.{patch}", os.major, os.minor),
	}
}

#[cfg(target_os = "ios")]
fn running_ios() -> IosVersion {
	let version =
		objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersion();
	let part = |value: isize| u32::try_from(value).unwrap_or_default();
	IosVersion {
		major: part(version.majorVersion),
		minor: part(version.minorVersion),
		patch: part(version.patchVersion),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn on(major: u32, minor: u32, patch: u32) -> String {
		iphone_safari(IosVersion {
			major,
			minor,
			patch,
		})
	}

	#[test]
	fn matches_safari_on_the_ios_27_simulator() {
		assert_eq!(
			on(27, 0, 0),
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) \
			 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 \
			 Mobile/15E148 Safari/604.1"
		);
	}

	#[test]
	fn matches_safari_on_the_ios_18_simulator() {
		assert_eq!(
			on(18, 0, 0),
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) \
			 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 \
			 Mobile/15E148 Safari/604.1"
		);
	}

	#[test]
	fn ios_26_0_reports_the_first_frozen_version() {
		assert_eq!(
			on(26, 0, 0),
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) \
			 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 \
			 Mobile/15E148 Safari/604.1"
		);
		assert!(on(26, 0, 1).contains("CPU iPhone OS 18_6 like"));
	}

	#[test]
	fn later_releases_keep_the_frozen_os_token_and_the_real_version() {
		for (major, minor, patch, version) in [
			(26, 1, 0, "Version/26.1 "),
			(26, 5, 2, "Version/26.5.2 "),
			(28, 3, 0, "Version/28.3 "),
		] {
			let user_agent = on(major, minor, patch);
			assert!(
				user_agent.contains("CPU iPhone OS 18_7 like Mac OS X"),
				"{user_agent}"
			);
			assert!(user_agent.contains(version), "{user_agent}");
		}
	}

	#[test]
	fn releases_before_the_freeze_report_their_own_version() {
		assert_eq!(
			on(17, 4, 1),
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) \
			 AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 \
			 Mobile/15E148 Safari/604.1"
		);
		assert!(on(16, 4, 0).contains("OS 16_4 like Mac OS X"));
		assert!(on(16, 4, 0).contains("Version/16.4 "));
	}
}
