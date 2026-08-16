mod encode;
mod heif;
mod source;

use tauri::{AppHandle, Runtime};

use crate::error::AppError;

use source::Format;

const JPEG: &str = "image/jpeg";
const DAMAGED: &str = "Unreadable or damaged photo";

#[cfg(target_os = "android")]
pub use heif::plugin;

pub struct Photo {
	pub bytes: Vec<u8>,
	pub content_type: String,
}

pub async fn normalize<R: Runtime>(
	app: &AppHandle<R>,
	bytes: Vec<u8>,
	content_type: String,
) -> Result<Photo, AppError> {
	let Some(format) = source::sniff(&bytes) else {
		return Ok(Photo {
			bytes,
			content_type,
		});
	};

	let source = if format == Format::Heif {
		heif::decode(app, bytes).await?
	} else {
		off_thread(move || source::decode(format, &bytes))
			.await?
			.ok_or_else(|| AppError::Media(DAMAGED.to_owned()))?
	};

	let bytes = off_thread(move || encode::to_jpeg(source))
		.await?
		.ok_or_else(|| AppError::Media(DAMAGED.to_owned()))?;

	Ok(Photo {
		bytes,
		content_type: JPEG.to_owned(),
	})
}

async fn off_thread<T: Send + 'static>(
	work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, AppError> {
	tokio::task::spawn_blocking(work)
		.await
		.map_err(|error| AppError::Media(error.to_string()))
}

#[cfg(test)]
mod tests {
	use image::{DynamicImage, ImageFormat};
	use std::io::Cursor;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

	use super::*;

	fn app() -> tauri::App<MockRuntime> {
		mock_builder()
			.build(mock_context(noop_assets()))
			.expect("mock app")
	}

	fn encoded(format: ImageFormat, width: u32, height: u32) -> Vec<u8> {
		let mut bytes = Vec::new();
		DynamicImage::new_rgb8(width, height)
			.write_to(&mut Cursor::new(&mut bytes), format)
			.expect("encode");
		bytes
	}

	fn dimensions(jpeg: &[u8]) -> (u32, u32) {
		image::ImageReader::with_format(Cursor::new(jpeg), ImageFormat::Jpeg)
			.into_dimensions()
			.expect("dimensions")
	}

	#[tokio::test]
	async fn a_video_is_forwarded_byte_for_byte() {
		let app = app();
		let clip = b"\0\0\0\x18ftypmp42\0\0\0\0moov".to_vec();

		let photo =
			normalize(app.handle(), clip.clone(), "video/mp4".to_owned())
				.await
				.expect("normalize");

		assert_eq!(photo.bytes, clip);
		assert_eq!(photo.content_type, "video/mp4");
	}

	#[tokio::test]
	async fn every_still_format_leaves_as_a_jpeg() {
		for format in [
			ImageFormat::Jpeg,
			ImageFormat::Png,
			ImageFormat::Gif,
			ImageFormat::Bmp,
			ImageFormat::Tiff,
			ImageFormat::WebP,
		] {
			let app = app();
			let source = encoded(format, 40, 20);

			let photo = normalize(
				app.handle(),
				source,
				"application/octet-stream".to_owned(),
			)
			.await
			.unwrap_or_else(|error| panic!("{format:?}: {error}"));

			assert_eq!(photo.content_type, JPEG, "{format:?}");
			assert_eq!(dimensions(&photo.bytes), (40, 20), "{format:?}");
		}
	}

	#[tokio::test]
	async fn a_photo_is_relabelled_even_when_the_caller_lied_about_its_type() {
		let app = app();

		let photo = normalize(
			app.handle(),
			encoded(ImageFormat::Png, 8, 8),
			"image/heic".to_owned(),
		)
		.await
		.expect("normalize");

		assert_eq!(photo.content_type, JPEG);
	}

	#[tokio::test]
	async fn a_damaged_photo_is_refused_rather_than_uploaded() {
		let app = app();

		let refused = normalize(
			app.handle(),
			vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00],
			JPEG.to_owned(),
		)
		.await;

		assert!(matches!(refused, Err(AppError::Media(_))));
	}

	#[tokio::test]
	async fn heic_is_refused_with_a_message_worth_showing_off_android() {
		let app = app();
		let mut heic = vec![0, 0, 0, 0x18];
		heic.extend_from_slice(b"ftypheic");

		let refused =
			normalize(app.handle(), heic, "image/heic".to_owned()).await;

		match refused {
			Err(AppError::Media(message)) => {
				assert!(!message.is_empty());
				assert!(!message.contains("Unreadable"), "{message}");
			}
			Err(other) => panic!("expected a media error, got {other}"),
			Ok(photo) => {
				panic!("expected a refusal, got {} bytes", photo.bytes.len())
			}
		}
	}
}
