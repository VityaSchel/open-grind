use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use grindr::{Bytes, Session};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Runtime;

use crate::api::rest::{encode_response, RawResponse};
use crate::error::AppError;
use crate::photo;
use crate::state::AppState;
use crate::upload::form::{FormPart, Framing};
use crate::upload::picked::{inspect, MediaKind, PickedFile};
use crate::upload::stream::{taken, ContentDigest, FileBody, FILE_CHANGED};

const MAX_PHOTO_BYTES: u64 = 64 * 1024 * 1024;

pub const NOT_MEDIA: &str = "That file is not a photo or a video";
pub const PHOTO_TOO_LARGE: &str = "Photos over 64 MB can't be uploaded";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartSpec {
	pub name: String,
	pub filename: String,
	pub content_type: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRequest {
	pub method: String,
	pub path: String,
	pub part: PartSpec,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadOutcome {
	pub response: String,
	pub sha256: String,
	pub body_size: u64,
}

#[derive(Debug)]
pub struct PreparedBody {
	pub content_type: String,
	pub body: Bytes,
	pub sha256: String,
	pub body_size: u64,
}

pub fn prepare_body(
	part: &FormPart<'_>,
	content: Bytes,
	max_body_size: u64,
) -> Result<PreparedBody, AppError> {
	let framing = Framing::new(part);
	let body_size = framing.size(content.len() as u64);
	if body_size > max_body_size {
		return Err(AppError::ContentTooLarge);
	}
	let sha256 = sha256_hex(&content);
	let body = framing.frame(content);
	Ok(PreparedBody {
		content_type: framing.content_type,
		body,
		sha256,
		body_size,
	})
}

pub fn sha256_hex(bytes: &[u8]) -> String {
	hex(&Sha256::digest(bytes))
}

pub fn hex(bytes: &[u8]) -> String {
	let mut hex = String::with_capacity(bytes.len() * 2);
	for byte in bytes {
		hex.push_str(&format!("{byte:02x}"));
	}
	hex
}

#[derive(Debug)]
enum Source {
	Photo { bytes: Vec<u8> },
	Video { size: u64 },
}

enum Payload<R: Runtime> {
	Whole(Bytes),
	Streamed(FileBody<R>),
}

enum ContentHash {
	Known(String),
	Pending(ContentDigest),
}

impl ContentHash {
	fn resolve(self) -> Result<String, AppError> {
		match self {
			ContentHash::Known(hex) => Ok(hex),
			ContentHash::Pending(digest) => taken(&digest)
				.map(|digest| hex(&digest))
				.ok_or_else(|| AppError::Media(FILE_CHANGED.to_owned())),
		}
	}
}

struct Outgoing<R: Runtime> {
	content_type: String,
	payload: Payload<R>,
	body_size: u64,
	sha256: ContentHash,
}

fn read_source(mut file: File) -> Result<Source, AppError> {
	let inspection = inspect(&mut file).map_err(media_error)?;
	match inspection.kind {
		MediaKind::Photo => {}
		MediaKind::Video => {
			return Ok(Source::Video {
				size: inspection.size,
			})
		}
		MediaKind::Unsupported => {
			return Err(AppError::Media(NOT_MEDIA.to_owned()))
		}
	}
	if inspection.size > MAX_PHOTO_BYTES {
		return Err(AppError::Media(PHOTO_TOO_LARGE.to_owned()));
	}
	file.seek(SeekFrom::Start(0)).map_err(media_error)?;
	let mut bytes =
		Vec::with_capacity(inspection.size.min(MAX_PHOTO_BYTES) as usize);
	(&mut file)
		.take(MAX_PHOTO_BYTES + 1)
		.read_to_end(&mut bytes)
		.map_err(media_error)?;
	if bytes.len() as u64 > MAX_PHOTO_BYTES {
		return Err(AppError::Media(PHOTO_TOO_LARGE.to_owned()));
	}
	Ok(Source::Photo { bytes })
}

fn media_error(error: io::Error) -> AppError {
	AppError::Media(error.to_string())
}

fn profile_of(session: &Option<Session>) -> Option<&str> {
	session
		.as_ref()
		.and_then(|session| session.credentials.profile_id.as_deref())
}

async fn open_and_read<R: Runtime>(
	app: tauri::AppHandle<R>,
	file: PickedFile,
) -> Result<Source, AppError> {
	tokio::task::spawn_blocking(move || {
		read_source(file.open(&app).map_err(media_error)?)
	})
	.await
	.map_err(|error| AppError::Media(error.to_string()))?
}

#[tauri::command]
pub async fn upload_media_file(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	file: PickedFile,
	request: UploadRequest,
	max_body_size: u64,
	profile_id: String,
) -> Result<UploadOutcome, AppError> {
	let client = state.client()?;
	let method = grindr::Method::from_str(&request.method).map_err(|_| {
		AppError::Api {
			code: 400,
			message: format!("Invalid method: {}", request.method),
		}
	})?;
	let _one_at_a_time = state.upload.lock().await;

	let source = open_and_read(app.clone(), file.clone()).await?;
	let outgoing = match source {
		Source::Photo { bytes } => {
			let photo = photo::normalize(
				&app,
				bytes,
				request.part.content_type.clone(),
			)
			.await?;
			let prepared = prepare_body(
				&FormPart {
					name: &request.part.name,
					filename: &request.part.filename,
					content_type: &photo.content_type,
				},
				Bytes::from(photo.bytes),
				max_body_size,
			)?;
			Outgoing {
				content_type: prepared.content_type,
				payload: Payload::Whole(prepared.body),
				body_size: prepared.body_size,
				sha256: ContentHash::Known(prepared.sha256),
			}
		}
		Source::Video { size } => {
			let framing = Framing::new(&FormPart {
				name: &request.part.name,
				filename: &request.part.filename,
				content_type: &request.part.content_type,
			});
			let body_size = framing.size(size);
			if body_size > max_body_size {
				return Err(AppError::ContentTooLarge);
			}
			let digest: ContentDigest = Arc::new(Mutex::new(None));
			Outgoing {
				content_type: framing.content_type.clone(),
				payload: Payload::Streamed(FileBody {
					app: app.clone(),
					file,
					framing,
					content_len: size,
					digest: Arc::clone(&digest),
				}),
				body_size,
				sha256: ContentHash::Pending(digest),
			}
		}
	};

	let mut sessions = client.session_receiver();
	if profile_of(&sessions.borrow()) != Some(profile_id.as_str()) {
		return Err(AppError::SessionCleared);
	}
	let request_builder = client.request(method, &request.path);
	let send = match outgoing.payload {
		Payload::Whole(body) => {
			request_builder.bytes(&outgoing.content_type, body)
		}
		Payload::Streamed(source) => {
			request_builder.stream(&outgoing.content_type, source)
		}
	}
	.send();
	let raw = tokio::select! {
		biased;
		_ = sessions.wait_for(|session| profile_of(session) != Some(profile_id.as_str())) => {
			return Err(AppError::SessionCleared);
		}
		sent = send => sent.map_err(|error| AppError::from_client_error(error, client))?,
	};

	Ok(UploadOutcome {
		response: encode_response(&RawResponse {
			status: raw.status,
			body: raw.body,
		})?,
		sha256: outgoing.sha256.resolve()?,
		body_size: outgoing.body_size,
	})
}

#[cfg(test)]
mod tests {
	use std::io::Write;
	use std::path::PathBuf;

	use super::*;

	const PART: FormPart<'static> = FormPart {
		name: "content",
		filename: "",
		content_type: "image/jpeg",
	};

	#[test]
	fn a_body_over_the_limit_is_refused_before_framing() {
		let content = Bytes::from(vec![1u8; 100]);
		let fits = prepare_body(&PART, content.clone(), 300).expect("fits");
		let refused = prepare_body(&PART, content, fits.body_size - 1)
			.expect_err("refused");

		assert!(matches!(refused, AppError::ContentTooLarge));
		assert_eq!(
			serde_json::to_value(&refused).unwrap()["kind"],
			"ContentTooLarge"
		);
	}

	#[test]
	fn the_framed_body_matches_its_reported_size_and_hashes_the_content() {
		let prepared =
			prepare_body(&PART, Bytes::from_static(b"abc"), u64::MAX)
				.expect("prepared");

		assert_eq!(prepared.body.len() as u64, prepared.body_size);
		assert!(prepared
			.content_type
			.starts_with("multipart/form-data; boundary="));
		assert_eq!(
			prepared.sha256,
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	}

	#[test]
	fn sha256_of_empty_input_is_the_known_digest() {
		assert_eq!(
			sha256_hex(b""),
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
		);
	}

	fn temp_file(name: &str, bytes: &[u8]) -> PathBuf {
		let path = std::env::temp_dir()
			.join(format!("og-content-{}-{name}", std::process::id()));
		File::create(&path)
			.expect("create")
			.write_all(bytes)
			.expect("write");
		path
	}

	#[test]
	fn a_photo_is_read_whole_after_the_sniff() {
		let mut bytes = b"\xFF\xD8\xFF\xE0".to_vec();
		bytes.resize(500, 7);
		let path = temp_file("photo.jpg", &bytes);

		let read = read_source(File::open(&path).expect("open")).expect("read");

		assert!(matches!(read, Source::Photo { bytes: read } if read == bytes));
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_video_is_left_on_disk_with_only_its_size_read() {
		let mut bytes = b"\0\0\0\x18ftypmp42\0\0\0\0".to_vec();
		bytes.resize(4096, 9);
		let path = temp_file("clip.mp4", &bytes);

		let read = read_source(File::open(&path).expect("open")).expect("read");

		assert!(matches!(read, Source::Video { size } if size == 4096));
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_stray_file_is_refused_as_a_media_error() {
		let stray = temp_file("notes.txt", b"hello");

		let stray_error =
			read_source(File::open(&stray).expect("open")).expect_err("stray");

		assert!(
			matches!(stray_error, AppError::Media(message) if message == NOT_MEDIA)
		);
		std::fs::remove_file(stray).ok();
	}

	#[test]
	fn a_pending_hash_that_was_never_filled_in_is_a_media_error() {
		let pending = ContentHash::Pending(Arc::new(Mutex::new(None)));
		let filled =
			ContentHash::Pending(Arc::new(Mutex::new(Some([7u8; 32]))));

		assert!(
			matches!(pending.resolve(), Err(AppError::Media(message)) if message == FILE_CHANGED)
		);
		assert_eq!(filled.resolve().expect("hash"), "07".repeat(32));
	}

	#[test]
	fn profile_of_reads_the_signed_in_profile() {
		let session = Some(Session {
			credentials: grindr::Credentials {
				email: "user@example.com".to_owned(),
				profile_id: Some("42".to_owned()),
				auth_token: "auth-token".to_owned(),
				kind: grindr::SessionKind::Email,
				third_party_user_id: None,
			},
			token: None,
		});
		assert_eq!(profile_of(&session), Some("42"));
		assert_eq!(profile_of(&None), None);
	}
}
