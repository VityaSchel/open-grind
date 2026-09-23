use std::io::Cursor;

use image::{ImageFormat, ImageReader};

use crate::api::rest::{encode_response, RawResponse};
use crate::error::AppError;
use crate::photo;
use crate::state::AppState;
use crate::upload::file::{
	open_photo, profile_of, signed_in_as, unless_session_changes, Race,
};
use crate::upload::picked::PickedFile;

const NOT_A_PHOTO: &str = "Only photos can be sent here";
const UNREADABLE_SIZE: &str = "That photo's size can't be read";

fn with_square_thumb(path: &str, jpeg: &[u8]) -> Result<String, AppError> {
	let (width, height) =
		ImageReader::with_format(Cursor::new(jpeg), ImageFormat::Jpeg)
			.into_dimensions()
			.map_err(|_| AppError::Media(UNREADABLE_SIZE.to_owned()))?;
	let side = width.min(height);
	let left = (width - side) / 2;
	let top = (height - side) / 2;
	let separator = if path.contains('?') { '&' } else { '?' };
	Ok(format!(
		"{path}{separator}thumbCoords={},{left},{},{top}",
		top + side,
		left + side,
	))
}

#[tauri::command]
pub async fn upload_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	path: String,
	signed: bool,
	file: PickedFile,
	square_thumb: Option<bool>,
) -> Result<String, AppError> {
	let client = state.client()?;
	let mut sessions = client.session_receiver();
	let Some(profile_id) = profile_of(&sessions.borrow()).map(str::to_owned)
	else {
		return Err(AppError::NotSignedIn);
	};
	let Some(bytes) = open_photo(app.clone(), file).await? else {
		return Err(AppError::Media(NOT_A_PHOTO.to_owned()));
	};
	let photo = photo::normalize(&app, bytes, photo::JPEG.to_owned()).await?;
	let path = if square_thumb.unwrap_or(false) {
		with_square_thumb(&path, &photo.bytes)?
	} else {
		path
	};

	if !signed_in_as(&sessions.borrow(), &profile_id) {
		return Err(AppError::SessionCleared);
	}
	let request = client.request(grindr::Method::POST, &path);
	let request = if signed {
		request.signed_bytes(&photo.content_type, photo.bytes)
	} else {
		request.bytes(&photo.content_type, photo.bytes)
	};
	let raw = unless_session_changes(Race {
		sessions: &mut sessions,
		profile_id: &profile_id,
		send: request.send(),
	})
	.await?
	.map_err(|e| AppError::from_client_error(e, client))?;

	encode_response(&RawResponse {
		status: raw.status,
		body: raw.body,
	})
}

#[cfg(test)]
mod tests {
	use image::{DynamicImage, ImageFormat};

	use super::*;

	fn jpeg(width: u32, height: u32) -> Vec<u8> {
		let mut bytes = Vec::new();
		DynamicImage::new_rgb8(width, height)
			.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Jpeg)
			.expect("encode");
		bytes
	}

	#[test]
	fn centers_a_square_thumb_on_a_portrait_photo() {
		assert_eq!(
			with_square_thumb(
				"/v4/media/upload?takenOnGrindr=false",
				&jpeg(768, 1024)
			)
			.expect("path"),
			"/v4/media/upload?takenOnGrindr=false&thumbCoords=896,0,768,128"
		);
	}

	#[test]
	fn centers_a_square_thumb_on_a_landscape_photo() {
		assert_eq!(
			with_square_thumb("/v4/media/upload", &jpeg(1024, 576))
				.expect("path"),
			"/v4/media/upload?thumbCoords=576,224,800,0"
		);
	}

	#[test]
	fn a_square_photo_is_its_own_thumb() {
		assert_eq!(
			with_square_thumb("/v4/media/upload", &jpeg(640, 640))
				.expect("path"),
			"/v4/media/upload?thumbCoords=640,0,640,0"
		);
	}

	#[test]
	fn a_photo_whose_size_cannot_be_read_is_refused() {
		let refused = with_square_thumb("/v4/media/upload", b"not a jpeg")
			.expect_err("refused");

		assert!(matches!(refused, AppError::Media(_)));
	}
}
