use std::fs::File;
use std::io::{self, BufReader, Seek, SeekFrom};

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
#[serde(rename_all = "camelCase")]
pub struct Inspection {
	pub kind: MediaKind,
	pub size: u64,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub width: Option<u32>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub height: Option<u32>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub duration_ms: Option<u64>,
}

pub fn inspect(file: &mut File) -> io::Result<Inspection> {
	let size = file.metadata()?.len();
	let mut head = [0u8; SNIFF_LEN];
	let filled = boxes::read_up_to(file, &mut head)?;
	let head = &head[..filled];
	let bare = |kind| Inspection {
		kind,
		size,
		width: None,
		height: None,
		duration_ms: None,
	};
	Ok(match sniff(head) {
		MediaKind::Photo => bare(MediaKind::Photo),
		MediaKind::Video => match probe::probe(file).ok().flatten() {
			Some(probed) => Inspection {
				width: Some(probed.width),
				height: Some(probed.height),
				duration_ms: probed.duration_ms,
				..bare(MediaKind::Video)
			},
			None => bare(MediaKind::Unsupported),
		},
		MediaKind::Unsupported => bare(MediaKind::Unsupported),
	})
}

fn inspect_as_shown(file: &mut File) -> io::Result<Inspection> {
	let inspection = inspect(file)?;
	if inspection.kind != MediaKind::Photo {
		return Ok(inspection);
	}
	let upright = photo_dimensions(file);
	Ok(Inspection {
		width: upright.map(|(width, _)| width),
		height: upright.map(|(_, height)| height),
		..inspection
	})
}

fn photo_dimensions(file: &mut File) -> Option<(u32, u32)> {
	file.seek(SeekFrom::Start(0)).ok()?;
	let mut head = [0u8; SNIFF_LEN];
	let filled = boxes::read_up_to(file, &mut head).ok()?;
	let format = source::sniff(&head[..filled])?;
	file.seek(SeekFrom::Start(0)).ok()?;
	source::dimensions(format, BufReader::new(file))
}

#[tauri::command]
pub async fn inspect_media_file(
	app: tauri::AppHandle,
	file: PickedFile,
) -> Result<Inspection, AppError> {
	photo::off_thread(move || inspect_as_shown(&mut file.open(&app)?))
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
				height: None,
				duration_ms: None,
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
		assert_eq!(inspection.duration_ms, Some(1000));
		assert_eq!(
			serde_json::to_value(inspection).unwrap()["durationMs"],
			1000
		);
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
				height: None,
				duration_ms: None,
			}
		);
	}

	fn jpeg_turned_by_exif(
		width: u32,
		height: u32,
		orientation: u8,
	) -> Vec<u8> {
		let mut jpeg = Vec::new();
		image::DynamicImage::new_rgb8(width, height)
			.write_to(
				&mut std::io::Cursor::new(&mut jpeg),
				image::ImageFormat::Jpeg,
			)
			.expect("encode");
		let mut exif =
			b"\xFF\xE1\0\x22Exif\0\0MM\0\x2A\0\0\0\x08\0\x01".to_vec();
		exif.extend_from_slice(b"\x01\x12\0\x03\0\0\0\x01\0");
		exif.extend_from_slice(&[orientation, 0, 0, 0, 0, 0, 0]);
		jpeg.splice(2..2, exif);
		jpeg
	}

	fn inspect_bytes(name: &str, bytes: &[u8]) -> Inspection {
		let app = app();
		let temp = TempFile::new(name, bytes);
		let path = temp.path().to_path_buf();
		app.fs_scope().allow_file(&path).expect("allow");
		let picked = PickedFile::Desktop { path: path.clone() };
		let quick = inspect(&mut picked.open(app.handle()).expect("open"))
			.expect("inspect");
		assert_eq!(
			(quick.width, quick.height),
			(None, None),
			"uploads and previews never decode headers just to inspect"
		);
		inspect_as_shown(&mut picked.open(app.handle()).expect("open"))
			.expect("inspect")
	}

	#[test]
	fn a_photo_inspects_with_the_size_it_is_shown_at() {
		let mut png = Vec::new();
		image::DynamicImage::new_rgba8(40, 20)
			.write_to(
				&mut std::io::Cursor::new(&mut png),
				image::ImageFormat::Png,
			)
			.expect("encode");

		let inspection = inspect_bytes("wide.png", &png);

		assert_eq!(inspection.kind, MediaKind::Photo);
		assert_eq!((inspection.width, inspection.height), (Some(40), Some(20)));
	}

	#[test]
	fn a_photo_turned_by_exif_inspects_upright() {
		for (orientation, upright) in
			[(1, (40, 20)), (6, (20, 40)), (8, (20, 40))]
		{
			let inspection = inspect_bytes(
				"turned.jpg",
				&jpeg_turned_by_exif(40, 20, orientation),
			);

			assert_eq!(
				(inspection.width, inspection.height),
				(Some(upright.0), Some(upright.1)),
				"orientation {orientation}"
			);
		}
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
