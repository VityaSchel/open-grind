use std::fs::File;
use std::io;

use serde::Serialize;

use super::media_error;
use crate::error::AppError;
use crate::photo::{self, source};
use crate::upload::picked::PickedFile;
use crate::video::{boxes, probe, sniff};

const SNIFF_LEN: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
	Photo,
	Video,
	Unsupported,
}

fn sniff(head: &[u8]) -> MediaKind {
	if source::sniff(head).is_some() {
		MediaKind::Photo
	} else if sniff::is_video(head) {
		MediaKind::Video
	} else {
		MediaKind::Unsupported
	}
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
	let filled = boxes::read_up_to(file, &mut head)?;
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
	photo::off_thread(move || inspect(&mut file.open(&app)?))
		.await?
		.map_err(media_error)
}

#[cfg(test)]
mod tests {
	use tauri_plugin_fs::FsExt;

	use super::*;
	use crate::upload::test_support::{app, TempFile};

	#[test]
	fn a_video_brand_without_a_readable_visual_track_is_unsupported() {
		let app = app();
		let mut bytes = b"\0\0\0\x18ftypmp42".to_vec();
		bytes.resize(200, 0);
		let temp = TempFile::new("allowed.mp4", &bytes);
		let path = temp.path().to_path_buf();
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
	}

	#[test]
	fn a_real_clip_inspects_with_the_dimensions_it_will_be_uploaded_with() {
		let app = app();
		let temp = TempFile::new(
			"real.mp4",
			include_bytes!("../video/fixtures/quicktime.mov"),
		);
		let path = temp.path().to_path_buf();
		app.fs_scope().allow_file(&path).expect("allow");
		let picked = PickedFile::Desktop { path: path.clone() };

		let inspection = inspect(&mut picked.open(app.handle()).expect("open"))
			.expect("inspect");

		assert_eq!(inspection.kind, MediaKind::Video);
		assert_eq!(inspection.width, Some(32));
		assert_eq!(inspection.height, Some(24));
	}

	#[test]
	fn a_file_shorter_than_the_sniff_window_still_inspects() {
		let app = app();
		let temp = TempFile::new("short.png", b"\x89PNG\r\n\x1a\n");
		let path = temp.path().to_path_buf();
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
