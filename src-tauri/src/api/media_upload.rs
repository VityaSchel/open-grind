use base64::{engine::general_purpose::STANDARD, Engine as _};
use grindr::GrindrClient;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::photo::{self, Photo};
use crate::state::AppState;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploadResponse {
	pub media_id: i64,
	pub url: String,
	pub media_hash: String,
}

async fn upload_signed_v6(
	client: &GrindrClient,
	photo: Photo,
) -> Result<MediaUploadResponse, AppError> {
	let response = client
		.upload_chat_media(photo.bytes, &photo.content_type, None, None, true)
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;

	Ok(MediaUploadResponse {
		media_id: response.media_id,
		url: response.url,
		media_hash: response.media_hash,
	})
}

async fn upload_unsigned_v5(
	client: &GrindrClient,
	photo: Photo,
) -> Result<MediaUploadResponse, AppError> {
	let response = client
		.upload_chat_media_unsigned(photo.bytes, &photo.content_type)
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;

	Ok(MediaUploadResponse {
		media_id: response.media_id,
		url: response.url,
		media_hash: response.media_hash,
	})
}

/// Signing marks media as taken on Grindr regardless of the query parameter,
/// so only in-app captures may take the signed endpoint.
#[tauri::command]
pub async fn upload_chat_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	content_type: String,
	taken_on_grindr: bool,
	// Base64, because raw byte arrays over the Tauri IPC are unreliable.
	// https://github.com/tauri-apps/tauri/issues/10573
	data: String,
) -> Result<MediaUploadResponse, AppError> {
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 media: {e}"))
	})?;
	let photo = photo::normalize(&app, bytes, content_type).await?;

	let client = state.client()?;
	if taken_on_grindr {
		upload_signed_v6(client, photo).await
	} else {
		upload_unsigned_v5(client, photo).await
	}
}
