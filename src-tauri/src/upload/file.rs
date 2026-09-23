use std::fs::File;
use std::future::Future;
use std::io::{Read, Seek, SeekFrom};
use std::sync::Arc;
use std::time::SystemTime;

use grindr::{Bytes, Session};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Runtime;

use crate::api::rest::{self, encode_response, RawResponse};
use crate::api::update::TransferHold;
use crate::error::AppError;
use crate::hex::hex;
use crate::photo;
use crate::state::AppState;
use crate::upload::form::{FormPart, Framing};
use crate::upload::inspect::{inspect, MediaKind};
use crate::upload::picked::PickedFile;
use crate::upload::stream::{ContentDigest, FileBody};
use crate::upload::{media_error, UploadLock};
use crate::video::strip::{self, Patch};

const MAX_PHOTO_BYTES: u64 = 64 * 1024 * 1024;
const VIDEO_MP4: &str = "video/mp4";

const NOT_MEDIA: &str = "That file is not a photo or a video";
const VIDEO_UNREADABLE: &str = "That video's format can't be read";

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
struct PreparedStream {
	framing: Framing,
	body_size: u64,
}

#[derive(Debug)]
struct PreparedBody {
	content_type: String,
	body: Bytes,
	sha256: String,
	body_size: u64,
}

struct StreamedPart<'a> {
	part: &'a FormPart<'a>,
	content_len: u64,
	max_body_size: u64,
}

struct WholePart<'a> {
	part: &'a FormPart<'a>,
	content: Bytes,
	max_body_size: u64,
}

fn prepare_stream(
	StreamedPart {
		part,
		content_len,
		max_body_size,
	}: StreamedPart<'_>,
) -> Result<PreparedStream, AppError> {
	let framing = Framing::new(part);
	let body_size = framing.size(content_len);
	if body_size > max_body_size {
		return Err(AppError::ContentTooLarge);
	}
	Ok(PreparedStream { framing, body_size })
}

fn prepare_body(
	WholePart {
		part,
		content,
		max_body_size,
	}: WholePart<'_>,
) -> Result<PreparedBody, AppError> {
	let prepared = prepare_stream(StreamedPart {
		part,
		content_len: content.len() as u64,
		max_body_size,
	})?;
	let sha256 = sha256_hex(&content);
	let body = prepared.framing.frame(content);
	Ok(PreparedBody {
		content_type: prepared.framing.content_type,
		body,
		sha256,
		body_size: prepared.body_size,
	})
}

fn photo_too_large() -> String {
	format!(
		"Photos over {} MB can't be uploaded",
		MAX_PHOTO_BYTES / 1024 / 1024
	)
}

pub(super) fn sha256_hex(bytes: &[u8]) -> String {
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
				digest.get().map(|digest| hex(&digest))
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
		MediaKind::Photo => Ok(Source::Photo {
			bytes: read_photo(&mut file, inspection.size)?,
		}),
		MediaKind::Video => {
			let uploaded_at = strip::movie_time(SystemTime::now());
			let patches = strip::plan(&mut file, uploaded_at)
				.map_err(media_error)?
				.ok_or_else(|| AppError::Media(VIDEO_UNREADABLE.to_owned()))?;
			Ok(Source::Video {
				size: inspection.size,
				patches: Arc::from(patches),
			})
		}
		MediaKind::Unsupported => Err(AppError::Media(NOT_MEDIA.to_owned())),
	}
}

fn read_photo(file: &mut File, size: u64) -> Result<Vec<u8>, AppError> {
	if size > MAX_PHOTO_BYTES {
		return Err(AppError::Media(photo_too_large()));
	}
	file.seek(SeekFrom::Start(0)).map_err(media_error)?;
	let mut bytes = Vec::with_capacity(size.min(MAX_PHOTO_BYTES) as usize);
	file.take(MAX_PHOTO_BYTES + 1)
		.read_to_end(&mut bytes)
		.map_err(media_error)?;
	if bytes.len() as u64 > MAX_PHOTO_BYTES {
		return Err(AppError::Media(photo_too_large()));
	}
	Ok(bytes)
}

pub(super) async fn open_photo<R: Runtime>(
	app: tauri::AppHandle<R>,
	file: PickedFile,
) -> Result<Option<Vec<u8>>, AppError> {
	photo::off_thread(move || {
		let mut file = file.open(&app).map_err(media_error)?;
		let inspection = inspect(&mut file).map_err(media_error)?;
		if inspection.kind != MediaKind::Photo {
			return Ok(None);
		}
		read_photo(&mut file, inspection.size).map(Some)
	})
	.await?
}

pub(super) fn profile_of(session: &Option<Session>) -> Option<&str> {
	session
		.as_ref()
		.and_then(|session| session.credentials.profile_id.as_deref())
}

pub(super) fn signed_in_as(
	session: &Option<Session>,
	profile_id: &str,
) -> bool {
	profile_of(session) == Some(profile_id)
}

pub(super) struct Race<'a, F> {
	pub sessions: &'a mut tokio::sync::watch::Receiver<Option<Session>>,
	pub profile_id: &'a str,
	pub send: F,
}

pub(super) async fn unless_session_changes<T>(
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
	photo::off_thread(move || {
		read_source(file.open(&app).map_err(media_error)?)
	})
	.await?
}

#[tauri::command]
pub async fn upload_media_file(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	upload_lock: tauri::State<'_, UploadLock>,
	file: PickedFile,
	request: UploadRequest,
	max_body_size: u64,
	profile_id: String,
) -> Result<UploadOutcome, AppError> {
	let client = state.client()?;
	rest::refuse_signed_path(&request.path)?;
	let method = rest::parse_method(&request.method)?;
	let _one_at_a_time = upload_lock.0.lock().await;
	let _background = TransferHold::media_upload(&app);

	let source = open_and_read(app.clone(), file.clone()).await?;
	let outgoing = match source {
		Source::Photo { bytes } => {
			let photo =
				photo::normalize(&app, bytes, photo::JPEG.to_owned()).await?;
			let prepared = prepare_body(WholePart {
				part: &FormPart {
					name: &request.part.name,
					filename: &request.part.filename,
					content_type: &photo.content_type,
				},
				content: Bytes::from(photo.bytes),
				max_body_size,
			})?;
			Outgoing {
				content_type: prepared.content_type,
				payload: Payload::Whole(prepared.body),
				body_size: prepared.body_size,
				sha256: ContentHash::Known(prepared.sha256),
			}
		}
		Source::Video { size, patches } => {
			let prepared = prepare_stream(StreamedPart {
				part: &FormPart {
					name: &request.part.name,
					filename: &request.part.filename,
					content_type: VIDEO_MP4,
				},
				content_len: size,
				max_body_size,
			})?;
			let digest = ContentDigest::default();
			Outgoing {
				content_type: prepared.framing.content_type.clone(),
				payload: Payload::Streamed(FileBody {
					app: app.clone(),
					file,
					framing: prepared.framing,
					content_len: size,
					patches,
					digest: digest.clone(),
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
	use std::sync::Mutex;

	use super::*;
	use crate::upload::test_support::TempFile;

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
		let fits = prepare_body(WholePart {
			part: &PART,
			content: content.clone(),
			max_body_size: 300,
		})
		.expect("fits");
		let refused = prepare_body(WholePart {
			part: &PART,
			content,
			max_body_size: fits.body_size - 1,
		})
		.expect_err("refused");

		assert!(matches!(refused, AppError::ContentTooLarge));
		assert_eq!(
			serde_json::to_value(&refused).unwrap()["kind"],
			"ContentTooLarge"
		);
	}

	#[test]
	fn a_streamed_video_is_refused_on_its_framed_length() {
		let fits = prepare_stream(StreamedPart {
			part: &CLIP_PART,
			content_len: 1024,
			max_body_size: u64::MAX,
		})
		.expect("fits");
		let refused = prepare_stream(StreamedPart {
			part: &CLIP_PART,
			content_len: 1024,
			max_body_size: fits.body_size - 1,
		})
		.expect_err("refused");

		assert_eq!(fits.body_size, fits.framing.size(1024));
		assert!(fits.body_size > 1024);
		assert!(matches!(refused, AppError::ContentTooLarge));
	}

	#[test]
	fn the_framed_body_matches_its_reported_size_and_hashes_the_content() {
		let prepared = prepare_body(WholePart {
			part: &PART,
			content: Bytes::from_static(b"abc"),
			max_body_size: u64::MAX,
		})
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

	#[test]
	fn a_photo_is_read_whole_after_the_sniff() {
		let mut bytes = b"\xFF\xD8\xFF\xE0".to_vec();
		bytes.resize(500, 7);
		let temp = TempFile::new("photo.jpg", &bytes);
		let path = temp.path().to_path_buf();

		let read = read_source(File::open(&path).expect("open")).expect("read");

		assert!(matches!(read, Source::Photo { bytes: read } if read == bytes));
	}

	#[test]
	fn a_video_is_left_on_disk_with_only_a_strip_plan_read() {
		let temp = TempFile::new("clip.mp4", CLIP);
		let path = temp.path().to_path_buf();

		let read = read_source(File::open(&path).expect("open")).expect("read");

		assert!(matches!(
			read,
			Source::Video { size, patches }
				if size == CLIP.len() as u64 && !patches.is_empty()
		));
	}

	#[test]
	fn a_video_brand_without_a_visual_track_is_not_media() {
		let mut bytes = b"\0\0\0\x18ftypmp42\0\0\0\0".to_vec();
		bytes.resize(4096, 9);
		let temp = TempFile::new("broken.mp4", &bytes);
		let path = temp.path().to_path_buf();

		let refused =
			read_source(File::open(&path).expect("open")).expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == NOT_MEDIA)
		);
	}

	#[test]
	fn a_video_whose_metadata_cannot_be_stripped_is_refused() {
		let mut bytes = CLIP.to_vec();
		let stco = bytes
			.windows(4)
			.rposition(|window| window == b"stco")
			.expect("stco");
		bytes[stco + 12..stco + 16].copy_from_slice(&u32::MAX.to_be_bytes());
		let temp = TempFile::new("unstrippable.mp4", &bytes);
		let path = temp.path().to_path_buf();

		let refused =
			read_source(File::open(&path).expect("open")).expect_err("refused");

		assert!(
			matches!(refused, AppError::Media(message) if message == VIDEO_UNREADABLE)
		);
	}

	#[test]
	fn a_stray_file_is_refused_as_a_media_error() {
		let stray_temp = TempFile::new("notes.txt", b"hello");
		let stray = stray_temp.path().to_path_buf();

		let stray_error =
			read_source(File::open(&stray).expect("open")).expect_err("stray");

		assert!(
			matches!(stray_error, AppError::Media(message) if message == NOT_MEDIA)
		);
	}

	#[test]
	fn a_pending_hash_that_was_never_filled_in_resolves_to_nothing() {
		let pending = ContentHash::Pending(ContentDigest::default());
		let filled = ContentHash::Pending(ContentDigest::holding([7u8; 32]));

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
