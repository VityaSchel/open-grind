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

fn decode_request(payload: &str) -> Result<RequestPayload, AppError> {
	let bytes = STANDARD.decode(payload).map_err(|e| {
		AppError::Http(format!("Failed to decode base64 payload: {e}"))
	})?;
	rmp_serde::from_slice(&bytes).map_err(|e| {
		AppError::Http(format!("Failed to decode request payload: {e}"))
	})
}

fn encode_response(response: &RawResponse) -> Result<String, AppError> {
	rmp_serde::encode::to_vec_named(response)
		.map(|bytes| STANDARD.encode(&bytes))
		.map_err(|e| AppError::Http(e.to_string()))
}

#[tauri::command]
pub async fn request(
	state: tauri::State<'_, AppState>,
	payload: String,
) -> Result<String, AppError> {
	let payload = decode_request(&payload)?;

	if grindr::requires_device_signature(&payload.path) {
		return Err(AppError::Api {
			code: 400,
			message: format!(
				"{} needs the signed upload command, not the REST bridge",
				payload.path
			),
		});
	}

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

	let client = state.client()?;
	let raw = client
		.request_authenticated_raw(method, &payload.path, json_body)
		.await
		.map_err(|e| AppError::from_client_error(e, client))?;

	encode_response(&RawResponse {
		status: raw.status,
		body: raw.body,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[derive(Serialize)]
	struct RequestAsFetchRestSendsIt<'a> {
		method: &'a str,
		path: &'a str,
		#[serde(with = "serde_bytes")]
		body: Option<Vec<u8>>,
	}

	fn as_payload<T: Serialize>(value: &T) -> String {
		STANDARD.encode(rmp_serde::encode::to_vec_named(value).unwrap())
	}

	fn position(haystack: &[u8], needle: &[u8]) -> Option<usize> {
		haystack
			.windows(needle.len())
			.position(|window| window == needle)
	}

	#[test]
	fn a_request_carrying_a_json_body_decodes_to_the_same_json() {
		let body = serde_json::json!({ "targetProfileIds": [1, 2], "q": null });
		let payload = as_payload(&RequestAsFetchRestSendsIt {
			method: "POST",
			path: "/v3/profiles",
			body: Some(rmp_serde::encode::to_vec_named(&body).unwrap()),
		});

		let decoded = decode_request(&payload).unwrap();

		assert_eq!(decoded.method, "POST");
		assert_eq!(decoded.path, "/v3/profiles");
		assert_eq!(
			rmp_serde::from_slice::<serde_json::Value>(&decoded.body.unwrap())
				.unwrap(),
			body
		);
	}

	#[test]
	fn a_null_body_and_a_missing_body_both_decode_to_none() {
		let with_null = as_payload(&RequestAsFetchRestSendsIt {
			method: "GET",
			path: "/v7/profiles/1",
			body: None,
		});
		let without_key = as_payload(&serde_json::json!({
			"method": "GET",
			"path": "/v7/profiles/1",
		}));

		assert!(decode_request(&with_null).unwrap().body.is_none());
		assert!(decode_request(&without_key).unwrap().body.is_none());
	}

	#[test]
	fn the_signed_upload_paths_are_the_ones_the_rest_bridge_refuses() {
		assert!(grindr::requires_device_signature("/v5/media/upload"));
		assert!(grindr::requires_device_signature(
			"/v6/chat/media/upload?takenOnGrindr=true"
		));

		assert!(!grindr::requires_device_signature(
			"/v5/chat/media/upload?takenOnGrindr=false"
		));
		assert!(!grindr::requires_device_signature("/v7/profiles/1"));
	}

	#[test]
	fn a_payload_that_is_not_base64_or_not_msgpack_is_an_error() {
		assert!(decode_request("not base64!!").is_err());
		assert!(decode_request(&STANDARD.encode(b"not msgpack")).is_err());
	}

	#[test]
	fn a_response_is_keyed_by_name_and_carries_its_body_as_msgpack_bin() {
		let body = vec![0x00, 0xff, 0x7b, 0x22, 0x61, 0x22, 0x7d];

		let encoded = encode_response(&RawResponse {
			status: 404,
			body: body.clone(),
		})
		.unwrap();

		let bytes = STANDARD.decode(&encoded).unwrap();
		assert!(position(&bytes, b"status").is_some());
		let body_key = position(&bytes, b"body").unwrap();
		assert!(
			matches!(bytes[body_key + 4], 0xc4..=0xc6),
			"fetchRest parses body with z.instanceof(Uint8Array), which needs msgpack bin"
		);

		let round_tripped: RawResponse = rmp_serde::from_slice(&bytes).unwrap();
		assert_eq!(round_tripped.status, 404);
		assert_eq!(round_tripped.body, body);
	}
}
