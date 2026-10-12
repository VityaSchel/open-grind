use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use super::file::open_photo;
use crate::error::AppError;
use crate::photo;
use crate::upload::picked::PickedFile;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
	data_url: String,
	width: u32,
	height: u32,
}

async fn preview<R: Runtime>(
	app: &AppHandle<R>,
	bytes: Vec<u8>,
) -> Result<Option<Preview>, AppError> {
	let Some(thumbnail) = photo::thumbnail(app, bytes).await? else {
		return Ok(None);
	};
	photo::off_thread(move || Preview {
		data_url: format!(
			"data:{};base64,{}",
			photo::JPEG,
			STANDARD.encode(&thumbnail.jpeg)
		),
		width: thumbnail.width,
		height: thumbnail.height,
	})
	.await
	.map(Some)
}

#[tauri::command]
pub async fn preview_media(
	app: AppHandle,
	file: PickedFile,
) -> Result<Option<Preview>, AppError> {
	match open_photo(app.clone(), file).await? {
		Some(bytes) => preview(&app, bytes).await,
		None => Ok(None),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::upload::test_support::app;

	#[tokio::test]
	async fn an_animated_gif_previews_as_the_jpeg_of_its_first_frame() {
		let app = app();
		let mut gif = Vec::new();
		image::codecs::gif::GifEncoder::new(&mut gif)
			.encode_frames((0..3).map(|_| {
				image::Frame::new(image::RgbaImage::from_pixel(
					6,
					4,
					image::Rgba([0, 0, 0, 0]),
				))
			}))
			.expect("encode");

		let preview = preview(app.handle(), gif)
			.await
			.expect("preview")
			.expect("a photo");

		assert!(preview.data_url.starts_with("data:image/jpeg;base64,/9j/"));
		assert_eq!((preview.width, preview.height), (6, 4));
	}

	#[tokio::test]
	async fn bytes_that_are_no_photo_have_no_preview() {
		let app = app();

		let preview = preview(app.handle(), b"not a photo".to_vec())
			.await
			.expect("preview");

		assert!(preview.is_none());
	}
}
