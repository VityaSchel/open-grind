use std::io::Cursor;

use image::{ImageFormat, ImageReader};
use serde::Deserialize;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PhotoCrop {
	ThumbCoords,
	CropAndThumb,
}

fn with_crop(
	path: &str,
	jpeg: &[u8],
	crop: PhotoCrop,
) -> Result<String, AppError> {
	let (width, height) =
		ImageReader::with_format(Cursor::new(jpeg), ImageFormat::Jpeg)
			.into_dimensions()
			.map_err(|_| AppError::Media(UNREADABLE_SIZE.to_owned()))?;
	let side = width.min(height);
	let left = (width - side) / 2;
	let top = (height - side) / 2;
	let (right, bottom) = (left + side, top + side);
	let query = match crop {
		PhotoCrop::ThumbCoords => {
			format!("thumbCoords={bottom},{left},{right},{top}")
		}
		PhotoCrop::CropAndThumb => format!(
			"crop_top=0&crop_bottom={height}&crop_left=0&crop_right={width}\
			&img_1_top={top}&img_1_bottom={bottom}\
			&img_1_left={left}&img_1_right={right}\
			&rotate=0&flip_vertical=false"
		),
	};
	let separator = if path.contains('?') { '&' } else { '?' };
	Ok(format!("{path}{separator}{query}"))
}

#[tauri::command]
pub async fn upload_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	path: String,
	signed: bool,
	file: PickedFile,
	crop: Option<PhotoCrop>,
) -> Result<String, AppError> {
	let _single_use = file.single_use(&app);
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
	let path = match crop {
		Some(crop) => with_crop(&path, &photo.bytes, crop)?,
		None => path,
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

	fn thumb_coords(path: &str, jpeg: &[u8]) -> String {
		with_crop(path, jpeg, PhotoCrop::ThumbCoords).expect("path")
	}

	fn crop_and_thumb(jpeg: &[u8]) -> String {
		with_crop("/v2/media/upload", jpeg, PhotoCrop::CropAndThumb)
			.expect("path")
	}

	#[test]
	fn centers_a_square_thumb_on_a_portrait_photo() {
		assert_eq!(
			thumb_coords(
				"/v4/media/upload?takenOnGrindr=false",
				&jpeg(768, 1024)
			),
			"/v4/media/upload?takenOnGrindr=false&thumbCoords=896,0,768,128"
		);
	}

	#[test]
	fn centers_a_square_thumb_on_a_landscape_photo() {
		assert_eq!(
			thumb_coords("/v4/media/upload", &jpeg(1024, 576)),
			"/v4/media/upload?thumbCoords=576,224,800,0"
		);
	}

	#[test]
	fn a_square_photo_is_its_own_thumb() {
		assert_eq!(
			thumb_coords("/v4/media/upload", &jpeg(640, 640)),
			"/v4/media/upload?thumbCoords=640,0,640,0"
		);
	}

	#[test]
	fn crops_a_portrait_photo_whole_with_a_centered_square_thumb() {
		assert_eq!(
			crop_and_thumb(&jpeg(768, 1024)),
			"/v2/media/upload?crop_top=0&crop_bottom=1024&crop_left=0\
			&crop_right=768&img_1_top=128&img_1_bottom=896&img_1_left=0\
			&img_1_right=768&rotate=0&flip_vertical=false"
		);
	}

	#[test]
	fn crops_a_landscape_photo_whole_with_a_centered_square_thumb() {
		assert_eq!(
			crop_and_thumb(&jpeg(1024, 576)),
			"/v2/media/upload?crop_top=0&crop_bottom=576&crop_left=0\
			&crop_right=1024&img_1_top=0&img_1_bottom=576&img_1_left=224\
			&img_1_right=800&rotate=0&flip_vertical=false"
		);
	}

	#[test]
	fn crops_a_square_photo_whole_and_thumbs_all_of_it() {
		assert_eq!(
			crop_and_thumb(&jpeg(640, 640)),
			"/v2/media/upload?crop_top=0&crop_bottom=640&crop_left=0\
			&crop_right=640&img_1_top=0&img_1_bottom=640&img_1_left=0\
			&img_1_right=640&rotate=0&flip_vertical=false"
		);
	}

	fn crop_named(name: &str) -> PhotoCrop {
		serde_json::from_value(serde_json::json!(name)).expect("crop")
	}

	#[test]
	fn the_crop_is_named_as_the_frontend_sends_it() {
		assert_eq!(crop_named("thumbCoords"), PhotoCrop::ThumbCoords);
		assert_eq!(crop_named("cropAndThumb"), PhotoCrop::CropAndThumb);
	}

	#[test]
	fn a_photo_whose_size_cannot_be_read_is_refused() {
		for crop in [PhotoCrop::ThumbCoords, PhotoCrop::CropAndThumb] {
			let refused = with_crop("/v4/media/upload", b"not a jpeg", crop)
				.expect_err("refused");

			assert!(matches!(refused, AppError::Media(_)));
		}
	}
}
