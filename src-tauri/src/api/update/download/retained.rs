use std::sync::Mutex;

use super::super::error::UpdateError;
use super::super::release::Candidate;
use super::super::storage::{Stage, Staged};
use super::super::verify::Prehash;
use super::body::Body;

struct Held {
	staged: Staged,
	body: Body,
	digest: Prehash,
}

#[derive(Default)]
pub(super) struct Retained(Mutex<Option<Held>>);

impl Retained {
	pub(super) fn keep(
		&self,
		stage: &Stage,
		staged: &Staged,
		digest: Prehash,
	) -> Result<(), UpdateError> {
		match Body::take(&stage.part())? {
			None => self.forget(),
			Some(body) => {
				let mut staged = staged.clone();
				staged.downloaded = body.length();
				*self.0.lock().unwrap() = Some(Held {
					staged,
					body,
					digest,
				});
			}
		}
		stage.discard()
	}

	pub(super) fn restore(
		&self,
		stage: &Stage,
		candidate: &Candidate,
		staged: &mut Staged,
		digest: &mut Prehash,
	) -> Result<(), UpdateError> {
		let mut held = {
			let mut slot = self.0.lock().unwrap();
			match slot.as_ref() {
				Some(held) if held.staged.describes(candidate) => {
					slot.take().unwrap()
				}
				Some(_) => {
					*slot = None;
					return Ok(());
				}
				None => return Ok(()),
			}
		};

		let written = stage
			.create()
			.and_then(|()| held.body.write_back(&stage.part()));
		if let Err(error) = written {
			*self.0.lock().unwrap() = Some(held);
			return Err(error);
		}
		*staged = held.staged;
		stage.save(staged)?;
		*digest = held.digest;
		Ok(())
	}

	pub(super) fn candidate(&self) -> Option<Candidate> {
		let held = self.0.lock().unwrap();
		held.as_ref()?.staged.clone().candidate()
	}

	pub(super) fn forget(&self) {
		*self.0.lock().unwrap() = None;
	}

	pub(super) fn retain_only(&self, candidate: Option<&Candidate>) {
		let mut slot = self.0.lock().unwrap();
		let kept = slot
			.as_ref()
			.zip(candidate)
			.is_some_and(|(held, wanted)| held.staged.describes(wanted));
		if !kept {
			*slot = None;
		}
	}
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;

	use super::super::super::release::Artifact;
	use super::super::super::{client, storage, verify};
	use super::*;

	fn hex(bytes: &[u8]) -> String {
		bytes.iter().map(|byte| format!("{byte:02x}")).collect()
	}

	fn root(name: &str) -> PathBuf {
		let root = std::env::temp_dir()
			.join(format!("og-retained-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&root);
		root
	}

	fn asset(uuid: &str) -> Candidate {
		Candidate {
			tag: "v0.2.0".into(),
			version: "0.2.0".into(),
			notes: None,
			published_at: None,
			payload: Artifact {
				name: "og.apk".into(),
				url: format!("{}og.apk", client::origin()),
				uuid: uuid.to_owned(),
				size: 8,
			},
			signature: Artifact {
				name: "og.apk.minisig".into(),
				url: format!("{}og.apk.minisig", client::origin()),
				uuid: "sig".into(),
				size: 228,
			},
		}
	}

	fn staged_for(candidate: &Candidate, downloaded: u64) -> Staged {
		let mut staged = Staged::new(candidate);
		staged.downloaded = downloaded;
		staged.validator = Some("\"etag\"".into());
		staged
	}

	#[test]
	fn keeping_a_cancelled_download_leaves_nothing_on_disk() {
		let root = root("keep");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");
		let staged = staged_for(&candidate, 4);
		stage.save(&staged).unwrap();

		let mut hashed = Prehash::default();
		hashed.update(b"half");
		let retained = Retained::default();
		retained.keep(&stage, &staged, hashed).unwrap();

		assert!(!stage.part().exists(), "the part file must be gone");
		assert!(
			stage.load().is_none(),
			"the sidecar must be gone with the bytes"
		);

		let mut restored = Staged::new(&candidate);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &candidate, &mut restored, &mut digest)
			.unwrap();
		assert_eq!(fs::read(stage.part()).unwrap(), b"half");
		assert_eq!(restored.downloaded, 4);
		assert_eq!(
			restored.validator.as_deref(),
			Some("\"etag\""),
			"the resume validator has to survive the round trip"
		);
		assert_eq!(
			digest.hashed(),
			4,
			"a resume must not have to re-read what it kept"
		);
		assert_eq!(
			hex(&digest.finish()),
			verify::payload_digest(&stage.part()).unwrap()
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_hold_can_name_the_release_it_belongs_to() {
		let root = root("candidate");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&candidate, 4), Prehash::default())
			.unwrap();

		let named = retained.candidate().expect(
			"a cancelled download stays startable without a fresh check",
		);
		assert_eq!(named.tag, candidate.tag);
		assert_eq!(named.payload.url, candidate.payload.url);
		assert_eq!(named.payload.uuid, candidate.payload.uuid);
		assert_eq!(named.payload.size, candidate.payload.size);
		assert_eq!(named.signature.url, candidate.signature.url);
		assert!(
			Staged::new(&named).describes(&candidate),
			"the synthesized candidate must still match what was kept"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_replaced_asset_drops_what_was_kept() {
		let root = root("stale");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");
		let staged = staged_for(&candidate, 4);

		let retained = Retained::default();
		retained.keep(&stage, &staged, Prehash::default()).unwrap();

		let replaced = asset("another-uuid");
		let mut restored = Staged::new(&replaced);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &replaced, &mut restored, &mut digest)
			.unwrap();

		assert!(
			!stage.part().exists(),
			"bytes for a replaced asset must never be written back"
		);
		assert_eq!(restored.downloaded, 0);

		let mut again = Staged::new(&candidate);
		retained
			.restore(&stage, &candidate, &mut again, &mut digest)
			.unwrap();
		assert_eq!(
			again.downloaded, 0,
			"a stale hold is dropped, not kept for later"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn discarding_the_update_drops_the_bytes_it_was_holding() {
		let root = root("forget");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&candidate, 4), Prehash::default())
			.unwrap();
		retained.forget();

		assert!(retained.candidate().is_none());
		let mut restored = Staged::new(&candidate);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &candidate, &mut restored, &mut digest)
			.unwrap();
		assert!(
			!stage.part().exists(),
			"a forgotten hold must never come back"
		);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_re_check_that_only_changed_the_notes_keeps_the_hold() {
		let root = root("retain-only");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"half").unwrap();
		let candidate = asset("uuid");

		let retained = Retained::default();
		retained
			.keep(&stage, &staged_for(&candidate, 4), Prehash::default())
			.unwrap();

		let edited = Candidate {
			notes: Some("# edited after the upload".into()),
			published_at: Some("2026-08-16T00:00:00Z".into()),
			..candidate.clone()
		};
		retained.retain_only(Some(&edited));
		assert!(
			retained.candidate().is_some(),
			"only the asset identity may invalidate a hold"
		);

		retained.retain_only(Some(&asset("another-uuid")));
		assert!(retained.candidate().is_none());
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn cancelling_before_a_single_byte_lands_holds_nothing() {
		let root = root("empty");
		let stage = storage::stage(&root, "v0.2.0").unwrap();
		stage.create().unwrap();
		let candidate = asset("uuid");
		let staged = staged_for(&candidate, 0);

		let retained = Retained::default();
		retained.keep(&stage, &staged, Prehash::default()).unwrap();

		let mut restored = Staged::new(&candidate);
		let mut digest = Prehash::default();
		retained
			.restore(&stage, &candidate, &mut restored, &mut digest)
			.unwrap();
		assert!(!stage.part().exists());
		assert_eq!(restored.downloaded, 0);
		let _ = fs::remove_dir_all(&root);
	}
}
