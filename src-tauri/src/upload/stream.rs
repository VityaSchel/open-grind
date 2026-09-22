use std::fs::File;
use std::io::{self, Cursor, Read, Take};
use std::sync::{Arc, Mutex};

use grindr::BodySource;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};

use crate::upload::form::Framing;
use crate::upload::picked::PickedFile;
use crate::video::strip::{Patch, PatchedReader};

const FILE_CHANGED: &str = "That file changed while it was uploading";

#[derive(Debug, Clone, Default)]
pub struct ContentDigest(Arc<Mutex<Option<[u8; 32]>>>);

impl ContentDigest {
	#[cfg(test)]
	pub fn holding(value: [u8; 32]) -> Self {
		let digest = Self::default();
		digest.set(Some(value));
		digest
	}

	pub fn get(&self) -> Option<[u8; 32]> {
		*self
			.0
			.lock()
			.unwrap_or_else(|poisoned| poisoned.into_inner())
	}

	fn set(&self, value: Option<[u8; 32]>) {
		*self
			.0
			.lock()
			.unwrap_or_else(|poisoned| poisoned.into_inner()) = value;
	}
}

pub struct FileBody<R: Runtime> {
	pub app: AppHandle<R>,
	pub file: PickedFile,
	pub framing: Framing,
	pub content_len: u64,
	pub patches: Arc<[Patch]>,
	pub digest: ContentDigest,
}

impl<R: Runtime> BodySource for FileBody<R> {
	fn size(&self) -> u64 {
		self.framing.size(self.content_len)
	}

	fn open(&self) -> io::Result<Box<dyn Read + Send>> {
		let file = self.file.open(&self.app)?;
		self.digest.set(None);
		let content = HashingReader {
			inner: PatchedReader::new(
				file.take(self.content_len),
				Arc::clone(&self.patches),
			),
			hasher: Sha256::new(),
			read: 0,
			expected: self.content_len,
			digest: self.digest.clone(),
		};
		Ok(Box::new(
			Cursor::new(self.framing.head.clone())
				.chain(content)
				.chain(Cursor::new(self.framing.tail.clone())),
		))
	}
}

struct HashingReader {
	inner: PatchedReader<Take<File>>,
	hasher: Sha256,
	read: u64,
	expected: u64,
	digest: ContentDigest,
}

impl Read for HashingReader {
	fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
		let read = self.inner.read(buf)?;
		if read == 0 {
			if self.read != self.expected {
				return Err(io::Error::new(
					io::ErrorKind::UnexpectedEof,
					FILE_CHANGED,
				));
			}
			self.digest.set(Some(self.hasher.clone().finalize().into()));
			return Ok(0);
		}
		self.hasher.update(&buf[..read]);
		self.read += read as u64;
		Ok(read)
	}
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use tauri::test::MockRuntime;
	use tauri_plugin_fs::FsExt;

	use super::*;
	use crate::hex::hex;
	use crate::upload::file::sha256_hex;
	use crate::upload::form::FormPart;
	use crate::upload::test_support::{app, TempFile};
	use crate::video::boxes::Span;
	use crate::video::strip::Fill;

	const CONTENT: &[u8] = b"a tiny clip pretending to be an mp4";

	fn body(
		app: &tauri::App<MockRuntime>,
		path: &PathBuf,
		content_len: u64,
	) -> FileBody<MockRuntime> {
		patched_body(app, path, content_len, Vec::new())
	}

	fn patched_body(
		app: &tauri::App<MockRuntime>,
		path: &PathBuf,
		content_len: u64,
		patches: Vec<Patch>,
	) -> FileBody<MockRuntime> {
		app.fs_scope().allow_file(path).expect("allow");
		FileBody {
			app: app.handle().clone(),
			file: PickedFile::Desktop { path: path.clone() },
			framing: Framing::new(&FormPart {
				name: "content",
				filename: "",
				content_type: "video/mp4",
			}),
			content_len,
			patches: Arc::from(patches),
			digest: ContentDigest::default(),
		}
	}

	#[test]
	fn the_stream_yields_exactly_the_size_it_promised() {
		let app = app();
		let temp = TempFile::new("clip.mp4", CONTENT);
		let path = temp.path().to_path_buf();
		let source = body(&app, &path, CONTENT.len() as u64);

		let mut framed = Vec::new();
		source
			.open()
			.expect("open")
			.read_to_end(&mut framed)
			.expect("read");

		assert_eq!(framed.len() as u64, source.size());
		assert_eq!(
			&framed[source.framing.head.len()
				..source.framing.head.len() + CONTENT.len()],
			CONTENT
		);
		assert!(framed.ends_with(&source.framing.tail));
	}

	#[test]
	fn a_strip_plan_changes_the_bytes_that_are_sent_and_hashed() {
		let app = app();
		let temp = TempFile::new("stripped.mp4", CONTENT);
		let path = temp.path().to_path_buf();
		let source = patched_body(
			&app,
			&path,
			CONTENT.len() as u64,
			vec![Patch {
				span: Span { start: 2, end: 6 },
				fill: Fill::Zeros,
			}],
		);
		let mut stripped = CONTENT.to_vec();
		stripped[2..6].fill(0);

		let mut framed = Vec::new();
		source
			.open()
			.expect("open")
			.read_to_end(&mut framed)
			.expect("read");

		assert_eq!(
			&framed[source.framing.head.len()
				..source.framing.head.len() + CONTENT.len()],
			stripped
		);
		assert_eq!(framed.len() as u64, source.size());
		assert_eq!(
			source.digest.get().map(|digest| hex(&digest)),
			Some(sha256_hex(&stripped))
		);
	}

	#[test]
	fn the_digest_covers_the_content_and_not_the_framing() {
		let app = app();
		let temp = TempFile::new("hashed.mp4", CONTENT);
		let path = temp.path().to_path_buf();
		let source = body(&app, &path, CONTENT.len() as u64);

		assert_eq!(source.digest.get(), None);
		io::copy(&mut source.open().expect("open"), &mut io::sink())
			.expect("copy");

		assert_eq!(
			source.digest.get().map(|digest| hex(&digest)),
			Some(sha256_hex(CONTENT))
		);
	}

	#[test]
	fn a_reopened_stream_starts_over_and_clears_the_digest() {
		let app = app();
		let temp = TempFile::new("reopened.mp4", CONTENT);
		let path = temp.path().to_path_buf();
		let source = body(&app, &path, CONTENT.len() as u64);
		io::copy(&mut source.open().expect("open"), &mut io::sink())
			.expect("copy");

		let mut second = source.open().expect("reopen");
		assert_eq!(source.digest.get(), None);
		let mut framed = Vec::new();
		second.read_to_end(&mut framed).expect("read");

		assert_eq!(framed.len() as u64, source.size());
		assert_eq!(
			source.digest.get().map(|digest| hex(&digest)),
			Some(sha256_hex(CONTENT))
		);
	}

	#[test]
	fn a_file_that_shrank_fails_instead_of_sending_a_short_body() {
		let app = app();
		let temp = TempFile::new("shrank.mp4", CONTENT);
		let path = temp.path().to_path_buf();
		let source = body(&app, &path, CONTENT.len() as u64 + 16);

		let failed =
			io::copy(&mut source.open().expect("open"), &mut io::sink())
				.expect_err("short");

		assert_eq!(failed.kind(), io::ErrorKind::UnexpectedEof);
		assert_eq!(failed.to_string(), FILE_CHANGED);
		assert_eq!(source.digest.get(), None);
	}

	#[test]
	fn a_file_that_grew_is_cut_to_the_promised_size() {
		let app = app();
		let temp = TempFile::new("grew.mp4", CONTENT);
		let path = temp.path().to_path_buf();
		let source = body(&app, &path, CONTENT.len() as u64 - 4);

		let mut framed = Vec::new();
		source
			.open()
			.expect("open")
			.read_to_end(&mut framed)
			.expect("read");

		assert_eq!(framed.len() as u64, source.size());
		assert_eq!(
			source.digest.get().map(|digest| hex(&digest)),
			Some(sha256_hex(&CONTENT[..CONTENT.len() - 4]))
		);
	}
}
