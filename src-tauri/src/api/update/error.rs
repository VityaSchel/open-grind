use std::fmt;

use serde::Serialize;

use super::install::Unsupported;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "kind",
	content = "detail"
)]
pub enum UpdateError {
	Network(String),
	Server { status: u16 },
	MalformedIndex(String),
	NoArtifact,
	Unsigned { tag: String },
	ForeignUrl(String),
	Signature(String),
	Storage(String),
	Oversize,
	AssetReplaced,
	Canceled,
	NothingStaged,
	Unsupported(Unsupported),
	NeedsUnknownSources,
	NeedsManualInstall,
	Install(String),
	CheckTooSoon { retry_after_secs: u64 },
	AutoChecksDisabled,
}

impl fmt::Display for UpdateError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		fmt::Debug::fmt(self, f)
	}
}

impl std::error::Error for UpdateError {}

impl From<std::io::Error> for UpdateError {
	fn from(e: std::io::Error) -> Self {
		UpdateError::Storage(e.to_string())
	}
}
