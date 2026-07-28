use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize, Deserialize)]
pub struct RawResponse {
	pub status: u16,
	#[serde(with = "serde_bytes")]
	pub body: Vec<u8>,
}

#[derive(Deserialize)]
struct RequestPayload {
	method: String,
	path: String,
	#[serde(with = "serde_bytes")]
	#[serde(default)]
	body: Option<Vec<u8>>,
}

#[tauri::command]
pub async fn request(
	state: tauri::State<'_, AppState>,
	payload: String,
) -> Result<String, AppError> {
	let bytes = STANDARD.decode(&payload).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 payload: {e}"))
	})?;

	let payload: RequestPayload =
		rmp_serde::from_slice(&bytes).map_err(|e| {
			AppError::Http(format!("Failed to decode request payload: {e}"))
		})?;

	let method = grindr::Method::from_str(&payload.method).map_err(|_| {
		AppError::Api {
			code: 400,
			message: format!("Invalid method: {}", payload.method),
		}
	})?;

	let json_body: Option<serde_json::Value> = match payload.body {
		Some(b) => Some(
			rmp_serde::from_slice::<serde_json::Value>(&b).map_err(|e| {
				AppError::Http(format!("Failed to decode msgpack body: {e}"))
			})?,
		),
		None => None,
	};

	let raw = state
		.client()?
		.request_authenticated_raw(method, &payload.path, json_body)
		.await?;

	let response = RawResponse {
		status: raw.status,
		body: raw.body,
	};
	let response_bytes = rmp_serde::encode::to_vec_named(&response)
		.map_err(|e| AppError::Http(e.to_string()))?;

	Ok(STANDARD.encode(&response_bytes))
}
