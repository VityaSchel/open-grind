use semver::Version;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallKind {
	Install,
	Update,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(desktop, allow(dead_code))]
pub enum Baseline {
	Absent,
	Installed { version: Version },
	Opaque { name: Option<String> },
	Unreadable { why: String },
}

impl Baseline {
	pub fn of_version(version: Version) -> Self {
		Self::Installed { version }
	}

	pub fn present(&self) -> bool {
		matches!(self, Self::Installed { .. } | Self::Opaque { .. })
	}

	pub fn installed_version(&self) -> Option<String> {
		match self {
			Self::Installed { version, .. } => Some(version.to_string()),
			Self::Opaque { name } => name.clone(),
			Self::Absent | Self::Unreadable { .. } => None,
		}
	}

	pub fn orderable(&self) -> bool {
		matches!(self, Self::Absent | Self::Installed { .. })
	}

	pub fn kind(&self) -> InstallKind {
		if self.present() {
			InstallKind::Update
		} else {
			InstallKind::Install
		}
	}

	pub fn superseded_by(&self, offered: &Version) -> bool {
		match self {
			Self::Absent => true,
			Self::Installed { version } => offered > version,
			Self::Opaque { .. } | Self::Unreadable { .. } => false,
		}
	}
}

impl Baseline {
	pub fn accepts_stage(&self, kind: InstallKind, staged: &Version) -> bool {
		if !self.orderable() {
			return false;
		}
		if kind == InstallKind::Update && !self.present() {
			return false;
		}
		self.superseded_by(staged)
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostVersion(Version);

impl HostVersion {
	pub fn of(version: Version) -> Self {
		Self(version)
	}
}

impl std::fmt::Display for HostVersion {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		self.0.fmt(f)
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Channel {
	prereleases: bool,
}

impl Channel {
	pub fn of_host(host: &HostVersion) -> Self {
		Self {
			prereleases: !host.0.pre.is_empty(),
		}
	}

	pub fn accepts_prereleases(self) -> bool {
		self.prereleases
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn v(text: &str) -> Version {
		Version::parse(text).unwrap()
	}

	#[test]
	fn an_absent_target_is_superseded_by_anything() {
		assert!(Baseline::Absent.superseded_by(&v("0.0.1")));
		assert_eq!(Baseline::Absent.kind(), InstallKind::Install);
		assert!(!Baseline::Absent.present());
	}

	#[test]
	fn an_installed_target_is_superseded_only_by_something_newer() {
		let installed = Baseline::of_version(v("1.1.0"));
		assert!(installed.superseded_by(&v("1.1.1")));
		assert!(!installed.superseded_by(&v("1.1.0")));
		assert!(!installed.superseded_by(&v("1.0.9")));
		assert_eq!(installed.kind(), InstallKind::Update);
	}

	#[test]
	fn an_unorderable_target_refuses_everything() {
		let opaque = Baseline::Opaque {
			name: Some("build-7".into()),
		};
		assert!(!opaque.superseded_by(&v("9.9.9")));
		assert!(opaque.present());
		assert_eq!(opaque.kind(), InstallKind::Update);

		let unreadable = Baseline::Unreadable {
			why: "probe failed".into(),
		};
		assert!(!unreadable.superseded_by(&v("9.9.9")));
		assert!(!unreadable.present());
	}

	#[test]
	fn only_a_present_target_reports_an_installed_version() {
		assert_eq!(
			Baseline::of_version(v("1.1.0"))
				.installed_version()
				.as_deref(),
			Some("1.1.0")
		);
		assert_eq!(
			Baseline::Opaque {
				name: Some("build-7".into())
			}
			.installed_version()
			.as_deref(),
			Some("build-7")
		);
		assert_eq!(Baseline::Opaque { name: None }.installed_version(), None);
		assert_eq!(Baseline::Absent.installed_version(), None);
		assert_eq!(
			Baseline::Unreadable {
				why: "probe failed".into()
			}
			.installed_version(),
			None
		);
	}

	fn host(text: &str) -> HostVersion {
		HostVersion::of(v(text))
	}

	#[test]
	fn a_prerelease_host_selects_the_prerelease_channel() {
		assert!(!Channel::of_host(&host("1.0.0")).accepts_prereleases());
		assert!(Channel::of_host(&host("0.1.0-beta.5")).accepts_prereleases());
	}
}
