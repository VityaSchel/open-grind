use std::fs::{self, File};
use std::io;
use std::path::Path;

use super::super::error::UpdateError;

pub(super) struct Body {
	#[cfg(unix)]
	file: File,
	#[cfg(not(unix))]
	bytes: Vec<u8>,
	length: u64,
}

impl Body {
	pub(super) fn length(&self) -> u64 {
		self.length
	}

	#[cfg(unix)]
	pub(super) fn take(part: &Path) -> Result<Option<Self>, UpdateError> {
		let file = match File::open(part) {
			Ok(file) => file,
			Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
			Err(e) => return Err(e.into()),
		};
		let length = file.metadata()?.len();
		if length == 0 {
			return Ok(None);
		}
		fs::remove_file(part)?;
		Ok(Some(Self { file, length }))
	}

	#[cfg(not(unix))]
	pub(super) fn take(part: &Path) -> Result<Option<Self>, UpdateError> {
		let bytes = match fs::read(part) {
			Ok(bytes) => bytes,
			Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
			Err(e) => return Err(e.into()),
		};
		if bytes.is_empty() {
			return Ok(None);
		}
		fs::remove_file(part)?;
		let length = bytes.len() as u64;
		Ok(Some(Self { bytes, length }))
	}

	#[cfg(unix)]
	pub(super) fn write_back(
		&mut self,
		part: &Path,
	) -> Result<(), UpdateError> {
		use std::io::{Seek, SeekFrom};

		self.file.seek(SeekFrom::Start(0))?;
		let mut destination = File::create(part)?;
		let copied = io::copy(&mut self.file, &mut destination)?;
		if copied != self.length {
			return Err(UpdateError::Storage(
				"the kept download was truncated".into(),
			));
		}
		destination.sync_data()?;
		Ok(())
	}

	#[cfg(not(unix))]
	pub(super) fn write_back(
		&mut self,
		part: &Path,
	) -> Result<(), UpdateError> {
		fs::write(part, &self.bytes)?;
		Ok(())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn scratch(name: &str) -> std::path::PathBuf {
		let path = std::env::temp_dir()
			.join(format!("og-body-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&path);
		fs::create_dir_all(&path).unwrap();
		path
	}

	#[test]
	fn taking_a_body_unnames_it_but_keeps_every_byte() {
		let dir = scratch("take");
		let part = dir.join("payload.part");
		fs::write(&part, b"a partial download").unwrap();

		let mut body = Body::take(&part).unwrap().expect("a body");
		assert!(!part.exists(), "the name must be gone straight away");
		assert_eq!(body.length(), 18);

		body.write_back(&part).unwrap();
		assert_eq!(fs::read(&part).unwrap(), b"a partial download");

		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn a_body_can_be_written_back_more_than_once() {
		let dir = scratch("twice");
		let part = dir.join("payload.part");
		fs::write(&part, b"bytes").unwrap();

		let mut body = Body::take(&part).unwrap().expect("a body");
		body.write_back(&part).unwrap();
		fs::remove_file(&part).unwrap();
		body.write_back(&part).unwrap();

		assert_eq!(fs::read(&part).unwrap(), b"bytes");
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn nothing_to_take_is_not_an_error() {
		let dir = scratch("missing");
		let part = dir.join("payload.part");

		assert!(Body::take(&part).unwrap().is_none());
		fs::write(&part, b"").unwrap();
		assert!(Body::take(&part).unwrap().is_none());

		let _ = fs::remove_dir_all(&dir);
	}
}
