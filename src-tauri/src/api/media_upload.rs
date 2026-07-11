use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

/// Response of the signed chat-media upload, re-serialized camelCase so the same
/// struct deserializes from Grindr and serializes back to the frontend.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploadResponse {
    pub media_id: i64,
    pub url: String,
    pub media_hash: String,
}

/// Uploads raw media bytes via the device-key-signed chat-media endpoint
/// (`POST /v6/chat/media/upload`) and returns the new `mediaId`. grindr.rs
/// registers the session signing key and adds the `X-Key-Id`/`X-Sig`/
/// `X-Timestamp`/`X-Nonce` headers on first use.
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
        .upload_chat_media(bytes, &content_type, None, None, taken_on_grindr)
        .await?;

    Ok(MediaUploadResponse {
        media_id: response.media_id,
        url: response.url,
        media_hash: response.media_hash,
    })
}
