use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;

use super::super::error::UpdateError;
use super::super::storage::{Stage, Staged};

pub(super) fn resume_offset(
	part: &Path,
	recorded: u64,
) -> Result<u64, UpdateError> {
	let on_disk = match fs::metadata(part) {
		Ok(meta) => meta.len(),
		Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
		Err(e) => return Err(e.into()),
	};
	let resume = on_disk.min(recorded);
	if on_disk != resume {
		OpenOptions::new().write(true).open(part)?.set_len(resume)?;
	}
	Ok(resume)
}

pub(super) fn truncate(part: &Path) -> Result<(), UpdateError> {
	match OpenOptions::new().write(true).open(part) {
		Ok(file) => Ok(file.set_len(0)?),
		Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
		Err(e) => Err(e.into()),
	}
}

pub(super) fn flush(
	sink: &mut BufWriter<File>,
	stage: &Stage,
	staged: &mut Staged,
	written: u64,
) -> Result<(), UpdateError> {
	sink.flush()?;
	sink.get_ref().sync_data()?;
	staged.downloaded = written;
	stage.save(staged)
}

pub(super) fn accept(
	stage: &Stage,
	staged: &mut Staged,
	verified: Result<String, UpdateError>,
	canceled: bool,
) -> Result<(), UpdateError> {
	let digest = match verified {
		Ok(digest) => digest,
		Err(error) => {
			let _ = stage.discard();
			return Err(error);
		}
	};
	if canceled {
		return Err(UpdateError::Canceled);
	}
	fs::rename(stage.part(), stage.payload())?;
	staged.payload_digest = Some(digest);
	staged.verified = true;
	stage.save(staged)?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use crate::api::update::storage;
	use crate::api::update::verify;

	use super::*;

	fn accept_fixture(name: &str) -> (std::path::PathBuf, Stage, Staged) {
		let root = std::env::temp_dir()
			.join(format!("og-accept-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&root);
		let stage = storage::stage(&root, "v1").unwrap();
		stage.create().unwrap();
		fs::write(stage.part(), b"payload bytes").unwrap();

		let mut staged = Staged {
			schema: storage::SCHEMA,
			tag: "v1".into(),
			version: "0.1.0".into(),
			payload_uuid: "uuid".into(),
			payload_size: 13,
			payload_url: "https://git.opengrind.org/a.apk".into(),
			signature_url: "https://git.opengrind.org/a.apk.minisig".into(),
			downloaded: 13,
			validator: None,
			verified: false,
			payload_digest: None,
		};
		stage.save(&staged).unwrap();
		staged.verified = false;
		(root, stage, staged)
	}

	#[test]
	fn a_failed_signature_never_produces_an_installable_payload() {
		let (root, stage, mut staged) = accept_fixture("bad-sig");

		let outcome = accept(
			&stage,
			&mut staged,
			Err(UpdateError::Signature("forged".into())),
			false,
		);

		assert!(matches!(outcome, Err(UpdateError::Signature(_))));
		assert!(
			!staged.verified,
			"a rejected payload must never be marked verified"
		);
		assert!(
			!stage.payload().exists(),
			"a rejected payload must never reach the install path"
		);
		let _ = fs::remove_dir_all(root);
	}

	#[test]
	fn a_cancel_during_verification_never_produces_an_installable_payload() {
		let (root, stage, mut staged) = accept_fixture("canceled");

		let digest = verify::payload_digest(&stage.part()).unwrap();
		let outcome = accept(&stage, &mut staged, Ok(digest), true);

		assert!(matches!(outcome, Err(UpdateError::Canceled)));
		assert!(!staged.verified);
		assert!(
			!stage.payload().exists(),
			"a cancelled download must not leave an installable payload"
		);
		let _ = fs::remove_dir_all(root);
	}

	#[test]
	fn a_good_signature_records_the_digest_that_gates_reuse() {
		let (root, stage, mut staged) = accept_fixture("good");

		let digest = verify::payload_digest(&stage.part()).unwrap();
		accept(&stage, &mut staged, Ok(digest), false).unwrap();

		assert!(staged.verified);
		assert!(stage.payload().exists());
		assert!(
			staged.payload_digest.is_some(),
			"reuse is gated on this digest"
		);
		assert!(staged.payload_on_disk(&stage));
		let _ = fs::remove_dir_all(root);
	}

	#[test]
	fn a_sidecar_that_overclaims_rewinds_to_what_is_really_on_disk() {
		let part = std::env::temp_dir()
			.join(format!("og-resume-{}", std::process::id()));
		fs::write(&part, vec![0u8; 100]).unwrap();

		assert_eq!(resume_offset(&part, 60).unwrap(), 60);
		assert_eq!(fs::metadata(&part).unwrap().len(), 60);
		assert_eq!(resume_offset(&part, 500).unwrap(), 60);

		fs::remove_file(&part).unwrap();
		assert_eq!(resume_offset(&part, 60).unwrap(), 0);
	}
}
