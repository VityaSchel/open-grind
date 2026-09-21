use std::fs::File;
use std::future::Future;
use std::io::{self, Read, Seek, SeekFrom};
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use grindr::{Bytes, Session};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Runtime;

use crate::api::rest::{encode_response, RawResponse};
use crate::api::update::TransferHold;
use crate::error::AppError;
use crate::hex::hex;
use crate::photo;
use crate::state::AppState;
use crate::upload::form::{FormPart, Framing};
use crate::upload::picked::{inspect, MediaKind, PickedFile};
use crate::upload::stream::{taken, ContentDigest, FileBody};
use crate::video::strip::{self, Patch};

const MAX_PHOTO_BYTES: u64 = 64 * 1024 * 1024;
const VIDEO_MP4: &str = "video/mp4";

pub const NOT_MEDIA: &str = "That file is not a photo or a video";
pub const PHOTO_TOO_LARGE: &str = "Photos over 64 MB can't be uploaded";
pub const VIDEO_UNREADABLE: &str = "That video's format can't be read";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartSpec {
	pub name: String,
	pub filename: String,
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
	pub sha256: Option<String>,
	pub body_size: u64,
}

#[derive(Debug)]
pub struct PreparedStream {
	pub framing: Framing,
	pub body_size: u64,
}

#[derive(Debug)]
pub struct PreparedBody {
	pub content_type: String,
	pub body: Bytes,
	pub sha256: String,
	pub body_size: u64,
}

pub fn prepare_stream(
	part: &FormPart<'_>,
	content_len: u64,
	max_body_size: u64,
) -> Result<PreparedStream, AppError> {
	let framing = Framing::new(part);
	let body_size = framing.size(content_len);
	if body_size > max_body_size {
		return Err(AppError::ContentTooLarge);
	}
	Ok(PreparedStream { framing, body_size })
}

pub fn prepare_body(
	part: &FormPart<'_>,
	content: Bytes,
	max_body_size: u64,
) -> Result<PreparedBody, AppError> {
	let prepared = prepare_stream(part, content.len() as u64, max_body_size)?;
	let sha256 = sha256_hex(&content);
	let body = prepared.framing.frame(content);
	Ok(PreparedBody {
		content_type: prepared.framing.content_type,
		body,
		sha256,
		body_size: prepared.body_size,
	})
}

pub fn sha256_hex(bytes: &[u8]) -> String {
	hex(&Sha256::digest(bytes))
}

#[derive(Debug)]
enum Source {
	Photo { bytes: Vec<u8> },
	Video { size: u64, patches: Arc<[Patch]> },
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
	fn resolve(self) -> Option<String> {
		match self {
			ContentHash::Known(hex) => Some(hex),
			ContentHash::Pending(digest) => {
				taken(&digest).map(|digest| hex(&digest))
			}
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
			let uploaded_at = strip::movie_time(SystemTime::now());
			let patches = strip::plan(&mut file, uploaded_at)
				.map_err(media_error)?
				.ok_or_else(|| AppError::Media(VIDEO_UNREADABLE.to_owned()))?;
			return Ok(Source::Video {
				size: inspection.size,
				patches: Arc::from(patches),
			});
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

fn signed_in_as(session: &Option<Session>, profile_id: &str) -> bool {
	profile_of(session) == Some(profile_id)
}

struct Race<'a, F> {
	sessions: &'a mut tokio::sync::watch::Receiver<Option<Session>>,
	profile_id: &'a str,
	send: F,
}

async fn unless_session_changes<T>(
	race: Race<'_, impl Future<Output = T>>,
) -> Result<T, AppError> {
	let Race {
		sessions,
		profile_id,
		send,
	} = race;
	tokio::select! {
		biased;
		_ = sessions.wait_for(|session| !signed_in_as(session, profile_id)) => {
			Err(AppError::SessionCleared)
		}
		sent = send => Ok(sent),
	}
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
	let _background = TransferHold::media_upload(&app);

	let source = open_and_read(app.clone(), file.clone()).await?;
	let outgoing = match source {
		Source::Photo { bytes } => {
			let photo =
				photo::normalize(&app, bytes, photo::JPEG.to_owned()).await?;
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
		Source::Video { size, patches } => {
			let prepared = prepare_stream(
				&FormPart {
					name: &request.part.name,
					filename: &request.part.filename,
					content_type: VIDEO_MP4,
				},
				size,
				max_body_size,
			)?;
			let digest: ContentDigest = Arc::new(Mutex::new(None));
			Outgoing {
				content_type: prepared.framing.content_type.clone(),
				payload: Payload::Streamed(FileBody {
					app: app.clone(),
					file,
					framing: prepared.framing,
					content_len: size,
					patches,
					digest: Arc::clone(&digest),
				}),
				body_size: prepared.body_size,
				sha256: ContentHash::Pending(digest),
			}
		}
	};

	let mut sessions = client.session_receiver();
	if !signed_in_as(&sessions.borrow(), &profile_id) {
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
	let raw = unless_session_changes(Race {
		sessions: &mut sessions,
		profile_id: &profile_id,
		send,
	})
	.await?
	.map_err(|error| AppError::from_client_error(error, client))?;

	Ok(UploadOutcome {
		response: encode_response(&RawResponse {
			status: raw.status,
			body: raw.body,
		})?,
		sha256: outgoing.sha256.resolve(),
		body_size: outgoing.body_size,
	})
}

#[cfg(test)]
mod tests {
	use std::io::Write;
	use std::path::PathBuf;

	use super::*;

	const CLIP: &[u8] = include_bytes!("../video/fixtures/metadata.mp4");

	const PART: FormPart<'static> = FormPart {
		name: "content",
		filename: "",
		content_type: "image/jpeg",
	};

	const CLIP_PART: FormPart<'static> = FormPart {
		name: "content",
		filename: "",
		content_type: VIDEO_MP4,
	};

	fn session_for(profile_id: &str) -> Session {
		Session {
			credentials: grindr::Credentials {
				email: "user@example.com".to_owned(),
				profile_id: Some(profile_id.to_owned()),
				auth_token: "auth-token".to_owned(),
				kind: grindr::SessionKind::Email,
				third_party_user_id: None,
			},
			token: None,
		}
	}

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
	fn a_streamed_video_is_refused_on_its_framed_length() {
		let fits = prepare_stream(&CLIP_PART, 1024, u64::MAX).expect("fits");
		let refused = prepare_stream(&CLIP_PART, 1024, fits.body_size - 1)
			.expect_err("refused");

		assert_eq!(fits.body_size, fits.framing.size(1024));
		assert!(fits.body_size > 1024);
		assert!(matches!(refused, AppError::ContentTooLarge));
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
	fn a_video_is_left_on_disk_with_only_a_strip_plan_read() {
		let path = temp_file("clip.mp4", CLIP);

		let read = read_source(File::open(&path).expect("open")).expect("read");

		assert!(matches!(
			read,
			Source::Video { size, patches }
				if size == CLIP.len() as u64 && !patches.is_empty()
		));
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_video_brand_without_a_visual_track_is_not_media() {
		let mut bytes = b"\0\0\0\x18ftypmp42\0\0\0\0".to_vec();
		bytes.resize(4096, 9);
		let path = temp_file("broken.mp4", &bytes);

		let refused =
			read_source(File::open(&path).expect("open")).expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == NOT_MEDIA)
		);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_video_whose_metadata_cannot_be_stripped_is_refused() {
		let mut bytes = CLIP.to_vec();
		let stco = bytes
			.windows(4)
			.rposition(|window| window == b"stco")
			.expect("stco");
		bytes[stco + 12..stco + 16].copy_from_slice(&u32::MAX.to_be_bytes());
		let path = temp_file("unstrippable.mp4", &bytes);

		let refused =
			read_source(File::open(&path).expect("open")).expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == VIDEO_UNREADABLE)
		);
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
	fn a_pending_hash_that_was_never_filled_in_resolves_to_nothing() {
		let pending = ContentHash::Pending(Arc::new(Mutex::new(None)));
		let filled =
			ContentHash::Pending(Arc::new(Mutex::new(Some([7u8; 32]))));

		assert_eq!(pending.resolve(), None);
		assert_eq!(filled.resolve().expect("hash"), "07".repeat(32));
	}

	#[test]
	fn profile_of_reads_the_signed_in_profile() {
		let session = Some(session_for("42"));

		assert_eq!(profile_of(&session), Some("42"));
		assert_eq!(profile_of(&None), None);
		assert!(signed_in_as(&session, "42"));
		assert!(!signed_in_as(&session, "7"));
		assert!(!signed_in_as(&None, "42"));
	}

	#[tokio::test]
	async fn a_send_that_finishes_first_is_handed_back() {
		let (_sessions, mut receiver) =
			tokio::sync::watch::channel(Some(session_for("42")));

		let sent = unless_session_changes(Race {
			sessions: &mut receiver,
			profile_id: "42",
			send: std::future::ready(7u8),
		})
		.await;

		assert_eq!(sent.expect("sent"), 7);
	}

	#[tokio::test]
	async fn a_session_change_drops_a_send_that_never_finishes() {
		let (sessions, mut receiver) =
			tokio::sync::watch::channel(Some(session_for("42")));
		let polled = Arc::new(Mutex::new(false));
		let flag = Arc::clone(&polled);
		let send = async move {
			*flag.lock().expect("flag") = true;
			std::future::pending::<u8>().await
		};
		sessions.send(Some(session_for("7"))).expect("send");

		let aborted = unless_session_changes(Race {
			sessions: &mut receiver,
			profile_id: "42",
			send,
		})
		.await;

		assert!(matches!(aborted, Err(AppError::SessionCleared)));
		assert!(!*polled.lock().expect("flag"));
	}
}
