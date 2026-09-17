use std::fs::File;
use std::io::{self, Read};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Runtime;
use tauri_plugin_fs::FsExt;

use crate::error::AppError;
use crate::photo::source;
use crate::video::probe;

const SNIFF_LEN: usize = 64;
const BOX_TYPE: &[u8] = b"ftyp";
const VIDEO_BRANDS: [&[u8]; 5] = [b"qt  ", b"avc1", b"M4V ", b"f4v ", b"mmp4"];
const VIDEO_BRAND_PREFIXES: [&[u8]; 3] = [b"iso", b"mp4", b"3g"];
const CONTENT_SCHEME: &str = "content://";

pub const OUTSIDE_SCOPE: &str =
	"That file is outside the folders this app may read";
pub const NOT_ANDROID: &str = "Android file URIs can only be opened on Android";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidUri {
	pub uri: String,
	pub document_top_tree_uri: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "source", rename_all = "lowercase")]
pub enum PickedFile {
	Android { uri: AndroidUri },
	Desktop { path: PathBuf },
}

impl PickedFile {
	pub fn open<R: Runtime>(
		&self,
		app: &tauri::AppHandle<R>,
	) -> io::Result<File> {
		match self {
			PickedFile::Desktop { path } => {
				let allowed = app
					.try_fs_scope()
					.is_some_and(|scope| scope.is_allowed(path));
				if !allowed {
					return Err(io::Error::new(
						io::ErrorKind::PermissionDenied,
						OUTSIDE_SCOPE,
					));
				}
				File::open(path)
			}
			PickedFile::Android { uri } => {
				if !uri.uri.starts_with(CONTENT_SCHEME) {
					return Err(io::Error::new(
						io::ErrorKind::PermissionDenied,
						OUTSIDE_SCOPE,
					));
				}
				open_android(app, uri)
			}
		}
	}
}

#[cfg(target_os = "android")]
fn open_android<R: Runtime>(
	app: &tauri::AppHandle<R>,
	uri: &AndroidUri,
) -> io::Result<File> {
	use tauri_plugin_android_fs::{AndroidFsExt, FileUri};
	let uri = FileUri {
		uri: uri.uri.clone(),
		document_top_tree_uri: uri.document_top_tree_uri.clone(),
	};
	app.android_fs()
		.open_file_readable(&uri)
		.map_err(|error| io::Error::other(error.to_string()))
}

#[cfg(not(target_os = "android"))]
fn open_android<R: Runtime>(
	_app: &tauri::AppHandle<R>,
	_uri: &AndroidUri,
) -> io::Result<File> {
	Err(io::Error::new(io::ErrorKind::Unsupported, NOT_ANDROID))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
	Photo,
	Video,
	Unsupported,
}

pub fn sniff(head: &[u8]) -> MediaKind {
	if source::sniff(head).is_some() {
		MediaKind::Photo
	} else if head.get(4..8) == Some(BOX_TYPE) && has_video_brand(head) {
		MediaKind::Video
	} else {
		MediaKind::Unsupported
	}
}

fn has_video_brand(head: &[u8]) -> bool {
	let Some(brand) = head.get(8..12) else {
		return false;
	};
	VIDEO_BRANDS.contains(&brand)
		|| VIDEO_BRAND_PREFIXES
			.iter()
			.any(|prefix| brand.starts_with(prefix))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Inspection {
	pub kind: MediaKind,
	pub size: u64,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub width: Option<u32>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub height: Option<u32>,
}

pub fn inspect(file: &mut File) -> io::Result<Inspection> {
	let size = file.metadata()?.len();
	let mut head = [0u8; SNIFF_LEN];
	let mut filled = 0;
	while filled < SNIFF_LEN {
		let read = file.read(&mut head[filled..])?;
		if read == 0 {
			break;
		}
		filled += read;
	}
	let sniffed = sniff(&head[..filled]);
	let probed = match sniffed {
		MediaKind::Video => probe::probe(file).ok().flatten(),
		_ => None,
	};
	let kind = if sniffed == MediaKind::Video && probed.is_none() {
		MediaKind::Unsupported
	} else {
		sniffed
	};
	Ok(Inspection {
		kind,
		size,
		width: probed.map(|probed| probed.width),
		height: probed.map(|probed| probed.height),
	})
}

#[tauri::command]
pub async fn inspect_media_file(
	app: tauri::AppHandle,
	file: PickedFile,
) -> Result<Inspection, AppError> {
	tokio::task::spawn_blocking(move || inspect(&mut file.open(&app)?))
		.await
		.map_err(|error| AppError::Media(error.to_string()))?
		.map_err(|error| AppError::Media(error.to_string()))
}

#[cfg(test)]
mod tests {
	use std::io::Write;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use super::*;

	fn app() -> tauri::App<MockRuntime> {
		mock_builder()
			.plugin(tauri_plugin_fs::init())
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	fn temp_file(name: &str, bytes: &[u8]) -> PathBuf {
		let path = std::env::temp_dir()
			.join(format!("og-picked-{}-{name}", std::process::id()));
		File::create(&path)
			.expect("create")
			.write_all(bytes)
			.expect("write");
		path
	}

	#[test]
	fn a_desktop_path_outside_the_scope_is_refused() {
		let app = app();
		let path = temp_file("outside.jpg", b"\xFF\xD8\xFF");
		let picked = PickedFile::Desktop { path: path.clone() };

		let refused = picked.open(app.handle()).expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::PermissionDenied);
		assert_eq!(refused.to_string(), OUTSIDE_SCOPE);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_video_brand_without_a_readable_visual_track_is_unsupported() {
		let app = app();
		let mut bytes = b"\0\0\0\x18ftypmp42".to_vec();
		bytes.resize(200, 0);
		let path = temp_file("allowed.mp4", &bytes);
		app.fs_scope().allow_file(&path).expect("allow");
		let picked = PickedFile::Desktop { path: path.clone() };

		let inspection = inspect(&mut picked.open(app.handle()).expect("open"))
			.expect("inspect");

		assert_eq!(
			inspection,
			Inspection {
				kind: MediaKind::Unsupported,
				size: 200,
				width: None,
				height: None
			}
		);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_real_clip_inspects_with_the_dimensions_it_will_be_uploaded_with() {
		let app = app();
		let path = temp_file(
			"real.mp4",
			include_bytes!("../video/fixtures/quicktime.mov"),
		);
		app.fs_scope().allow_file(&path).expect("allow");
		let picked = PickedFile::Desktop { path: path.clone() };

		let inspection = inspect(&mut picked.open(app.handle()).expect("open"))
			.expect("inspect");

		assert_eq!(inspection.kind, MediaKind::Video);
		assert_eq!(inspection.width, Some(32));
		assert_eq!(inspection.height, Some(24));
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn a_file_shorter_than_the_sniff_window_still_inspects() {
		let app = app();
		let path = temp_file("short.png", b"\x89PNG\r\n\x1a\n");
		app.fs_scope().allow_file(&path).expect("allow");
		let picked = PickedFile::Desktop { path: path.clone() };

		let inspection = inspect(&mut picked.open(app.handle()).expect("open"))
			.expect("inspect");

		assert_eq!(
			inspection,
			Inspection {
				kind: MediaKind::Photo,
				size: 8,
				width: None,
				height: None
			}
		);
		std::fs::remove_file(path).ok();
	}

	#[test]
	fn an_android_uri_outside_the_content_provider_is_refused() {
		let app = app();
		let picked = PickedFile::Android {
			uri: AndroidUri {
				uri: "file:///data/data/org.opengrind/credentials".to_owned(),
				document_top_tree_uri: None,
			},
		};

		let refused = picked.open(app.handle()).expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::PermissionDenied);
		assert_eq!(refused.to_string(), OUTSIDE_SCOPE);
	}

	#[test]
	fn an_android_uri_is_refused_off_android() {
		let app = app();
		let picked = PickedFile::Android {
			uri: AndroidUri {
				uri: "content://media/external/images/media/1".to_owned(),
				document_top_tree_uri: None,
			},
		};

		let refused = picked.open(app.handle()).expect_err("refused");

		assert_eq!(refused.kind(), io::ErrorKind::Unsupported);
	}

	#[test]
	fn the_descriptor_matches_the_frontend_shape() {
		let desktop: PickedFile = serde_json::from_str(
			r#"{"source":"desktop","key":"k","mimeType":null,"path":"/tmp/a.jpg"}"#,
		)
		.expect("desktop");
		assert!(
			matches!(desktop, PickedFile::Desktop { path } if path == std::path::Path::new("/tmp/a.jpg"))
		);

		let android: PickedFile = serde_json::from_str(
			r#"{"source":"android","key":"k","mimeType":"video/mp4","uri":{"uri":"content://x","documentTopTreeUri":null}}"#,
		)
		.expect("android");
		assert!(
			matches!(android, PickedFile::Android { uri } if uri.uri == "content://x")
		);

		assert!(serde_json::from_str::<PickedFile>(
			r#"{"source":"web","key":"k","mimeType":null}"#
		)
		.is_err());
	}

	#[test]
	fn sniff_tells_photos_videos_and_the_rest_apart() {
		assert_eq!(sniff(b"\xFF\xD8\xFF\xE0"), MediaKind::Photo);
		assert_eq!(sniff(b"\x89PNG\r\n\x1a\n"), MediaKind::Photo);
		assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), MediaKind::Photo);
		assert_eq!(sniff(b"\0\0\0\x18ftypheic\0\0\0\0"), MediaKind::Photo);
		assert_eq!(sniff(b"\0\0\0\x18ftypmp42\0\0\0\0"), MediaKind::Video);
		assert_eq!(sniff(b"\0\0\0\x14ftypqt  \0\0\0\0"), MediaKind::Video);
		assert_eq!(sniff(b"\0\0\0\x18ftypisom"), MediaKind::Video);
		assert_eq!(
			sniff(b"\0\0\0\x18ftypM4A \0\0\0\0"),
			MediaKind::Unsupported
		);
		assert_eq!(
			sniff(b"\0\0\0\x18ftypavif\0\0\0\0"),
			MediaKind::Unsupported
		);
		assert_eq!(sniff(b"\x1aE\xdf\xa3webm"), MediaKind::Unsupported);
		assert_eq!(sniff(b"ftyp"), MediaKind::Unsupported);
		assert_eq!(sniff(b""), MediaKind::Unsupported);
	}
}
