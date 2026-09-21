use std::fs::File;
use std::io::{self, Cursor, Read, Take};
use std::sync::{Arc, Mutex};

use grindr::BodySource;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};

use crate::upload::form::Framing;
use crate::upload::picked::PickedFile;
use crate::video::strip::{Patch, PatchedReader};

pub const FILE_CHANGED: &str = "That file changed while it was uploading";

pub type ContentDigest = Arc<Mutex<Option<[u8; 32]>>>;

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
		store(&self.digest, None);
		let content = HashingReader {
			inner: PatchedReader::new(
				file.take(self.content_len),
				Arc::clone(&self.patches),
			),
			hasher: Sha256::new(),
			read: 0,
			expected: self.content_len,
			digest: Arc::clone(&self.digest),
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
			store(&self.digest, Some(self.hasher.clone().finalize().into()));
			return Ok(0);
		}
		self.hasher.update(&buf[..read]);
		self.read += read as u64;
		Ok(read)
	}
}

pub fn taken(digest: &ContentDigest) -> Option<[u8; 32]> {
	*digest
		.lock()
		.unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn store(digest: &ContentDigest, value: Option<[u8; 32]>) {
	*digest
		.lock()
		.unwrap_or_else(|poisoned| poisoned.into_inner()) = value;
}

#[cfg(test)]
mod tests {
	use std::io::Write;
	use std::path::PathBuf;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri_plugin_fs::FsExt;

	use super::*;
	use crate::hex::hex;
	use crate::upload::content::sha256_hex;
	use crate::upload::form::FormPart;
	use crate::video::boxes::Span;
	use crate::video::strip::Fill;

	const CONTENT: &[u8] = b"a tiny clip pretending to be an mp4";

	fn temp_file(name: &str, bytes: &[u8]) -> PathBuf {
		let path = std::env::temp_dir()
			.join(format!("og-stream-{}-{name}", std::process::id()));
		File::create(&path)
			.expect("create")
			.write_all(bytes)
			.expect("write");
		path
	}

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
			digest: Arc::new(Mutex::new(None)),
		}
	}

	fn app() -> tauri::App<MockRuntime> {
		mock_builder()
			.plugin(tauri_plugin_fs::init())
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	#[test]
	fn the_stream_yields_exactly_the_size_it_promised() {
		let app = app();
		let path = temp_file("clip.mp4", CONTENT);
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
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_strip_plan_changes_the_bytes_that_are_sent_and_hashed() {
		let app = app();
		let path = temp_file("stripped.mp4", CONTENT);
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
			taken(&source.digest).map(|digest| hex(&digest)),
			Some(sha256_hex(&stripped))
		);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn the_digest_covers_the_content_and_not_the_framing() {
		let app = app();
		let path = temp_file("hashed.mp4", CONTENT);
		let source = body(&app, &path, CONTENT.len() as u64);

		assert_eq!(taken(&source.digest), None);
		io::copy(&mut source.open().expect("open"), &mut io::sink())
			.expect("copy");

		assert_eq!(
			taken(&source.digest).map(|digest| hex(&digest)),
			Some(sha256_hex(CONTENT))
		);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_reopened_stream_starts_over_and_clears_the_digest() {
		let app = app();
		let path = temp_file("reopened.mp4", CONTENT);
		let source = body(&app, &path, CONTENT.len() as u64);
		io::copy(&mut source.open().expect("open"), &mut io::sink())
			.expect("copy");

		let mut second = source.open().expect("reopen");
		assert_eq!(taken(&source.digest), None);
		let mut framed = Vec::new();
		second.read_to_end(&mut framed).expect("read");

		assert_eq!(framed.len() as u64, source.size());
		assert_eq!(
			taken(&source.digest).map(|digest| hex(&digest)),
			Some(sha256_hex(CONTENT))
		);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_file_that_shrank_fails_instead_of_sending_a_short_body() {
		let app = app();
		let path = temp_file("shrank.mp4", CONTENT);
		let source = body(&app, &path, CONTENT.len() as u64 + 16);

		let failed =
			io::copy(&mut source.open().expect("open"), &mut io::sink())
				.expect_err("short");

		assert_eq!(failed.kind(), io::ErrorKind::UnexpectedEof);
		assert_eq!(failed.to_string(), FILE_CHANGED);
		assert_eq!(taken(&source.digest), None);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_file_that_grew_is_cut_to_the_promised_size() {
		let app = app();
		let path = temp_file("grew.mp4", CONTENT);
		let source = body(&app, &path, CONTENT.len() as u64 - 4);

		let mut framed = Vec::new();
		source
			.open()
			.expect("open")
			.read_to_end(&mut framed)
			.expect("read");

		assert_eq!(framed.len() as u64, source.size());
		assert_eq!(
			taken(&source.digest).map(|digest| hex(&digest)),
			Some(sha256_hex(&CONTENT[..CONTENT.len() - 4]))
		);
		std::fs::remove_file(path).ok();
	}
}
