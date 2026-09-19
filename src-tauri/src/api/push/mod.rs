#[cfg(target_os = "android")]
#[path = "android.rs"]
mod backend;
#[cfg(not(target_os = "android"))]
#[path = "unsupported.rs"]
mod backend;
mod error;

#[cfg(target_os = "android")]
pub use backend::plugin;
pub use error::PushError;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;

const MINT_ATTEMPTS: usize = 3;
const MINT_RETRY: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushToken {
	pub token: String,
	pub vendor_provided_identifier: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushCategory {
	pub category: String,
	pub enabled: bool,
	pub system_blocked: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushMode {
	Slow,
	Fast,
}

impl PushMode {
	pub fn wire(self) -> &'static str {
		match self {
			Self::Slow => "slow",
			Self::Fast => "fast",
		}
	}

	pub fn of(wire: &str) -> Self {
		match wire {
			"fast" => Self::Fast,
			_ => Self::Slow,
		}
	}
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSignal {
	pub deeplink_pending: bool,
	pub token_changed: bool,
}

#[tauri::command]
pub async fn push_addon_ready(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::addon_ready(&app).await?)
}

#[tauri::command]
pub async fn push_token(app: AppHandle) -> Result<PushToken, AppError> {
	for attempt in 1..MINT_ATTEMPTS {
		match backend::token(&app).await {
			Ok(token) => return Ok(split_token(token)?),
			Err(error) if error.is_transient() => {
				tracing::warn!("[push] mint attempt {attempt} failed: {error}");
				tokio::time::sleep(MINT_RETRY).await;
			}
			Err(error) => return Err(error.into()),
		}
	}
	Ok(split_token(backend::token(&app).await?)?)
}

#[tauri::command]
pub async fn push_delete_token(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::delete_token(&app).await?)
}

#[tauri::command]
pub async fn push_mode(app: AppHandle) -> Result<PushMode, AppError> {
	Ok(backend::mode(&app).await?)
}

#[tauri::command]
pub async fn push_set_mode(
	app: AppHandle,
	mode: PushMode,
) -> Result<(), AppError> {
	Ok(backend::set_mode(&app, mode).await?)
}

#[tauri::command]
pub async fn push_categories(
	app: AppHandle,
) -> Result<Vec<PushCategory>, AppError> {
	Ok(backend::categories(&app).await?)
}

#[tauri::command]
pub async fn push_set_category(
	app: AppHandle,
	category: String,
	enabled: bool,
) -> Result<(), AppError> {
	Ok(backend::set_category(&app, category, enabled).await?)
}

#[tauri::command]
pub async fn push_open_category_settings(
	app: AppHandle,
	category: String,
) -> Result<(), AppError> {
	Ok(backend::open_category_settings(&app, category).await?)
}

#[tauri::command]
pub async fn push_notifications_permitted(
	app: AppHandle,
) -> Result<bool, AppError> {
	Ok(backend::notifications_permitted(&app).await?)
}

#[tauri::command]
pub async fn push_request_notifications(
	app: AppHandle,
) -> Result<bool, AppError> {
	Ok(backend::request_notifications(&app).await?)
}

#[tauri::command]
pub async fn push_take_deeplink(
	app: AppHandle,
) -> Result<Option<String>, AppError> {
	Ok(backend::take_deeplink(&app).await?)
}

#[tauri::command]
pub fn push_watch(
	app: AppHandle,
	on_event: tauri::ipc::Channel<PushSignal>,
) -> Result<(), AppError> {
	Ok(backend::watch(&app, on_event)?)
}

fn split_token(token: String) -> Result<PushToken, PushError> {
	let printable = token.bytes().all(|byte| (0x21..=0x7E).contains(&byte));
	let (identifier, rest) = token.split_once(':').unwrap_or_default();
	if !printable || identifier.is_empty() || rest.is_empty() {
		return Err(PushError::MalformedToken);
	}
	Ok(PushToken {
		vendor_provided_identifier: identifier.to_owned(),
		token,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_vendor_identifier_is_the_firebase_installation_id_before_the_colon()
	{
		let token = "fEJ0SZYSQm-bC1Zq:APA91bHqR-3xY_0".to_owned();
		assert_eq!(
			split_token(token.clone()),
			Ok(PushToken {
				vendor_provided_identifier: "fEJ0SZYSQm-bC1Zq".to_owned(),
				token,
			})
		);
	}

	#[test]
	fn a_token_that_is_not_a_grindr_registration_pair_is_malformed() {
		for token in [
			"",
			"APA91bHqR3xY0",
			":APA91bHqR3xY0",
			"fEJ0SZYSQm:",
			"fEJ0SZYS Qm:APA91b",
			"fEJ0SZYSQm:APA91b\n",
		] {
			assert_eq!(
				split_token(token.to_owned()),
				Err(PushError::MalformedToken),
				"{token:?} was accepted"
			);
		}
	}

	#[test]
	fn a_token_keeps_every_colon_after_the_first_one() {
		let token = "fid:APA91b:extra".to_owned();
		let split = split_token(token.clone()).unwrap();
		assert_eq!(split.vendor_provided_identifier, "fid");
		assert_eq!(split.token, token);
	}

	#[test]
	fn every_mode_survives_the_trip_to_the_frontend_and_back() {
		for mode in [PushMode::Slow, PushMode::Fast] {
			let wire = serde_json::to_value(mode).unwrap();
			assert_eq!(wire, serde_json::json!(mode.wire()));
			assert_eq!(PushMode::of(mode.wire()), mode);
			assert_eq!(serde_json::from_value::<PushMode>(wire).unwrap(), mode);
		}
	}

	#[test]
	fn a_mode_open_grind_does_not_know_falls_back_to_the_safe_one() {
		for wire in ["", "off", "FAST", "instant"] {
			assert_eq!(PushMode::of(wire), PushMode::Slow);
		}
	}

	#[test]
	fn the_signal_reaches_the_frontend_with_camel_case_keys() {
		let json = serde_json::to_value(PushSignal {
			deeplink_pending: true,
			token_changed: false,
		})
		.unwrap();
		assert_eq!(json["deeplinkPending"], true);
		assert_eq!(json["tokenChanged"], false);
	}
}
