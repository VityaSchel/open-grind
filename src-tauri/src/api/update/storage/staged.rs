use std::fs;

use semver::Version;
use serde::{Deserialize, Serialize};

use super::super::release::{Artifact, Candidate};
use super::{Stage, SCHEMA};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Staged {
	pub schema: u32,
	pub tag: String,
	pub version: String,
	pub payload_uuid: String,
	pub payload_size: u64,
	pub payload_url: String,
	pub signature_url: String,
	pub downloaded: u64,
	pub validator: Option<String>,
	pub verified: bool,
	#[serde(default)]
	pub payload_digest: Option<String>,
}

impl Staged {
	pub fn new(candidate: &Candidate) -> Self {
		Self {
			schema: SCHEMA,
			tag: candidate.tag.clone(),
			version: candidate.version.clone(),
			payload_uuid: candidate.payload.uuid.clone(),
			payload_size: candidate.payload.size,
			payload_url: candidate.payload.url.clone(),
			signature_url: candidate.signature.url.clone(),
			downloaded: 0,
			validator: None,
			verified: false,
			payload_digest: None,
		}
	}

	pub fn describes(&self, candidate: &Candidate) -> bool {
		self.schema == SCHEMA
			&& self.tag == candidate.tag
			&& self.payload_uuid == candidate.payload.uuid
			&& self.payload_size == candidate.payload.size
			&& self.payload_url == candidate.payload.url
	}

	pub fn version(&self) -> Option<Version> {
		Version::parse(&self.version).ok()
	}

	pub fn payload_on_disk(&self, stage: &Stage) -> bool {
		self.payload_digest.is_some()
			&& fs::metadata(stage.payload())
				.is_ok_and(|meta| meta.len() == self.payload_size)
	}

	pub fn candidate(self) -> Option<Candidate> {
		Candidate {
			tag: self.tag,
			version: self.version,
			notes: None,
			published_at: None,
			payload: Artifact {
				name: String::new(),
				url: self.payload_url,
				uuid: self.payload_uuid,
				size: self.payload_size,
			},
			signature: Artifact {
				name: String::new(),
				url: self.signature_url,
				uuid: String::new(),
				size: 0,
			},
		}
		.admitted()
		.ok()
	}
}
