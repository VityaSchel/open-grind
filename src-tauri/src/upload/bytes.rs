use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::api::rest::{encode_response, RawResponse};
use crate::error::AppError;
use crate::photo;
use crate::state::AppState;

#[tauri::command]
pub async fn upload_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	path: String,
	signed: bool,
	content_type: String,
	// Base64, because raw byte arrays over the Tauri IPC are unreliable.
	// https://github.com/tauri-apps/tauri/issues/10573
	data: String,
) -> Result<String, AppError> {
	let bytes = STANDARD.decode(&data).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 media: {e}"))
	})?;
	let photo = photo::normalize(&app, bytes, content_type).await?;

	let client = state.client()?;
	let request = client.request(grindr::Method::POST, &path);
	let request = if signed {
		request.signed_bytes(&photo.content_type, photo.bytes)
	} else {
		request.bytes(&photo.content_type, photo.bytes)
	};
	let raw = request
		.send()
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;

	encode_response(&RawResponse {
		status: raw.status,
		body: raw.body,
	})
}
