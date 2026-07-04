use base64::{engine::general_purpose::STANDARD, Engine as _};
use grindr::{GrindrError, Method};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

/// Response of `POST /v5/chat/media/upload`. Field names match Grindr's JSON so
/// the same struct deserializes the response and serializes back to the
/// frontend.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploadResponse {
    pub media_id: i64,
    pub url: String,
    pub media_hash: String,
}

/// Uploads raw media bytes to the chat media endpoint and returns the new
/// `mediaId`, mirroring the app's `uploadMediaV2` (`POST v5/chat/media/upload`,
/// `Content-type` header, `takenOnGrindr` query).
#[tauri::command]
pub async fn upload_chat_media(
    state: tauri::State<'_, AppState>,
    content_type: String,
    taken_on_grindr: bool,
    // Base64, because raw byte arrays over the Tauri IPC are unreliable.
    // https://github.com/tauri-apps/tauri/issues/10573
    data: String,
) -> Result<MediaUploadResponse, AppError> {
    let bytes = STANDARD
        .decode(&data)
        .map_err(|e| AppError::Http(format!("Failed to decode base64 media: {e}")))?;

    let response = state
        .client()?
        .request_authenticated_bytes(
            Method::POST,
            &format!("/v5/chat/media/upload?takenOnGrindr={taken_on_grindr}"),
            &content_type,
            bytes,
        )
        .await?;

    if !(200..300).contains(&response.status) {
        return Err(GrindrError::from_response(response.status, &response.body).into());
    }
    serde_json::from_slice(&response.body)
        .map_err(|e| AppError::Http(format!("Failed to parse upload response: {e}")))
}
