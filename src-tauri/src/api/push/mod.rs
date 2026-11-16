#[cfg(target_os = "android")]
mod android;
mod announcement;
#[cfg(not(target_os = "android"))]
mod desktop;
mod error;
#[cfg(test)]
mod pins;

#[cfg(target_os = "android")]
use android as backend;
pub use announcement::{Announcement, Category};
pub use backend::plugin;
#[cfg(not(target_os = "android"))]
use desktop as backend;
pub use error::PushError;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;
use crate::state::AppState;

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
#[serde(rename_all = "kebab-case")]
pub enum NotificationPermissionState {
	Granted,
	Prompt,
	PromptWithRationale,
	#[serde(other)]
	Denied,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPermission {
	pub granted: bool,
	pub state: NotificationPermissionState,
}

#[cfg_attr(target_os = "android", allow(dead_code))]
impl NotificationPermission {
	const fn settled(granted: bool) -> Self {
		Self {
			granted,
			state: if granted {
				NotificationPermissionState::Granted
			} else {
				NotificationPermissionState::Denied
			},
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushMode {
	Fast,
	Slow,
}

#[cfg(test)]
impl PushMode {
	pub fn wire(self) -> String {
		serde_json::to_value(self)
			.unwrap()
			.as_str()
			.unwrap()
			.to_owned()
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FastSource {
	Addon,
	Relay,
}

#[cfg(test)]
impl FastSource {
	pub const ALL: [Self; 2] = [Self::Addon, Self::Relay];

	pub fn wire(self) -> String {
		serde_json::to_value(self)
			.unwrap()
			.as_str()
			.unwrap()
			.to_owned()
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelayStatus {
	pub paired: bool,
	pub broken: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelayCommit {
	pub matched: bool,
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
pub async fn push_notifications_enabled(
	app: AppHandle,
) -> Result<bool, AppError> {
	Ok(backend::notifications_enabled(&app).await?)
}

#[tauri::command]
pub async fn push_set_notifications_enabled(
	app: AppHandle,
	enabled: bool,
) -> Result<(), AppError> {
	Ok(backend::set_notifications_enabled(&app, enabled).await?)
}

#[tauri::command]
pub async fn push_dismiss_conversation(
	app: AppHandle,
	conversation_id: String,
	message_id: Option<String>,
) -> Result<(), AppError> {
	Ok(
		backend::dismiss_conversation(&app, conversation_id, message_id)
			.await?,
	)
}

#[tauri::command]
pub async fn push_shown_conversations(
	app: AppHandle,
) -> Result<Vec<String>, AppError> {
	Ok(backend::shown_conversations(&app).await?)
}

#[tauri::command]
pub async fn push_open_notification_settings(
	app: AppHandle,
) -> Result<(), AppError> {
	Ok(backend::open_notification_settings(&app).await?)
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
pub async fn push_fast_source(
	app: AppHandle,
) -> Result<Option<FastSource>, AppError> {
	Ok(backend::fast_source(&app).await?)
}

#[tauri::command]
pub async fn push_set_fast_source(
	app: AppHandle,
	source: FastSource,
) -> Result<(), AppError> {
	Ok(backend::set_fast_source(&app, source).await?)
}

#[tauri::command]
pub async fn push_play_services(app: AppHandle) -> Result<bool, AppError> {
	Ok(backend::play_services(&app).await?)
}

#[tauri::command]
pub async fn push_relay_begin(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_begin(&app).await?)
}

#[tauri::command]
pub async fn push_relay_save_config(app: AppHandle) -> Result<bool, AppError> {
	Ok(backend::relay_save_config(&app).await?)
}

#[tauri::command]
pub async fn push_relay_share_config(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_share_config(&app).await?)
}

#[tauri::command]
pub async fn push_relay_await(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_await(&app).await?)
}

#[tauri::command]
pub async fn push_relay_commit(
	app: AppHandle,
	state: tauri::State<'_, AppState>,
	code: String,
) -> Result<RelayCommit, AppError> {
	let profile_id = signed_in_profile(state.client()?)?;
	Ok(backend::relay_commit(&app, code, profile_id).await?)
}

#[tauri::command]
pub async fn push_relay_register(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_register(&app).await?)
}

#[tauri::command]
pub async fn push_relay_unregister(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_unregister(&app).await?)
}

#[tauri::command]
pub async fn push_relay_cancel(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_cancel(&app).await?)
}

#[tauri::command]
pub async fn push_relay_forget(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_forget(&app).await?)
}

#[tauri::command]
pub async fn push_relay_drop_orphans(app: AppHandle) -> Result<(), AppError> {
	Ok(backend::relay_drop_orphans(&app).await?)
}

#[tauri::command]
pub async fn push_relay_status(
	app: AppHandle,
) -> Result<RelayStatus, AppError> {
	Ok(backend::relay_status(&app).await?)
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
pub async fn push_notification_permission(
	app: AppHandle,
) -> Result<NotificationPermission, AppError> {
	Ok(backend::notification_permission(&app).await?)
}

#[tauri::command]
pub async fn push_request_notification_permission(
	app: AppHandle,
) -> Result<NotificationPermission, AppError> {
	Ok(backend::request_notification_permission(&app).await?)
}

#[tauri::command]
pub async fn push_notify(
	app: AppHandle,
	announcement: Announcement,
) -> Result<(), AppError> {
	Ok(backend::notify(&app, announcement).await?)
}

#[tauri::command]
pub async fn push_take_deeplink(
	app: AppHandle,
) -> Result<Option<String>, AppError> {
	Ok(backend::take_deeplink(&app).await?)
}

#[tauri::command]
pub async fn push_deeplink_pending(app: AppHandle) -> Result<bool, AppError> {
	Ok(backend::deeplink_pending(&app).await?)
}

#[tauri::command]
pub fn push_watch(
	app: AppHandle,
	on_event: tauri::ipc::Channel<PushSignal>,
) -> Result<(), AppError> {
	Ok(backend::watch(&app, on_event)?)
}

fn signed_in_profile(
	client: &grindr::GrindrClient,
) -> Result<String, AppError> {
	let profile_id = client
		.session_receiver()
		.borrow()
		.as_ref()
		.and_then(|session| session.credentials.profile_id.clone())
		.filter(|profile_id| !profile_id.is_empty());
	profile_id.ok_or(AppError::NotSignedIn)
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

	fn decoded<T: serde::de::DeserializeOwned>(wire: &str) -> T {
		serde_json::from_value(serde_json::json!(wire)).unwrap()
	}

	#[test]
	fn every_mode_survives_the_trip_to_the_frontend_and_back() {
		for (mode, wire) in [(PushMode::Slow, "slow"), (PushMode::Fast, "fast")]
		{
			assert_eq!(serde_json::to_value(mode).unwrap(), wire);
			assert_eq!(decoded::<PushMode>(wire), mode);
		}
	}

	#[test]
	fn a_mode_open_grind_does_not_know_is_refused_rather_than_guessed() {
		for wire in ["", "off", "FAST", "instant"] {
			assert!(
				serde_json::from_value::<PushMode>(serde_json::json!(wire))
					.is_err(),
				"{wire:?} was accepted as a mode"
			);
		}
	}

	#[test]
	fn every_fast_source_survives_the_trip_to_the_frontend_and_back() {
		for (source, wire) in
			[(FastSource::Addon, "addon"), (FastSource::Relay, "relay")]
		{
			assert_eq!(serde_json::to_value(source).unwrap(), wire);
			assert_eq!(decoded::<FastSource>(wire), source);
		}
	}

	#[test]
	fn a_fast_source_open_grind_does_not_know_is_refused_rather_than_guessed() {
		for wire in ["", "fcm", "Addon", "RELAY", "unifiedpush"] {
			assert!(
				serde_json::from_value::<FastSource>(serde_json::json!(wire))
					.is_err(),
				"{wire:?} was accepted as a fast source"
			);
		}
	}

	fn client_signed_in_as(profile_id: Option<&str>) -> grindr::GrindrClient {
		grindr::GrindrClient::new(
			grindr::DeviceInfo::generate(),
			Some(grindr::Session {
				credentials: grindr::Credentials {
					email: "user@example.com".to_owned(),
					profile_id: profile_id.map(str::to_owned),
					auth_token: "auth-token".to_owned(),
					kind: grindr::SessionKind::Email,
					third_party_user_id: None,
				},
				token: None,
			}),
		)
		.unwrap()
	}

	#[test]
	fn a_relay_commit_pairs_the_signed_in_profile() {
		assert_eq!(
			signed_in_profile(&client_signed_in_as(Some("42"))).unwrap(),
			"42"
		);
		for profile_id in [None, Some("")] {
			assert!(matches!(
				signed_in_profile(&client_signed_in_as(profile_id)),
				Err(AppError::NotSignedIn)
			));
		}
		let signed_out =
			grindr::GrindrClient::new(grindr::DeviceInfo::generate(), None)
				.unwrap();
		assert!(matches!(
			signed_in_profile(&signed_out),
			Err(AppError::NotSignedIn)
		));
	}

	#[test]
	fn the_relay_answers_decode_whole() {
		assert_eq!(
			serde_json::from_value::<RelayStatus>(
				serde_json::json!({ "paired": true, "broken": false })
			)
			.unwrap(),
			RelayStatus {
				paired: true,
				broken: false,
			}
		);
		assert_eq!(
			serde_json::from_value::<RelayCommit>(
				serde_json::json!({ "matched": true })
			)
			.unwrap(),
			RelayCommit { matched: true }
		);
	}

	#[test]
	fn every_permission_state_survives_the_trip_to_the_frontend_and_back() {
		for (state, wire) in [
			(NotificationPermissionState::Granted, "granted"),
			(NotificationPermissionState::Denied, "denied"),
			(NotificationPermissionState::Prompt, "prompt"),
			(
				NotificationPermissionState::PromptWithRationale,
				"prompt-with-rationale",
			),
		] {
			assert_eq!(serde_json::to_value(state).unwrap(), wire);
			assert_eq!(decoded::<NotificationPermissionState>(wire), state);
		}
	}

	#[test]
	fn a_permission_state_android_invents_later_counts_as_denied() {
		for wire in ["", "GRANTED", "ask", "prompt_with_rationale"] {
			assert_eq!(
				decoded::<NotificationPermissionState>(wire),
				NotificationPermissionState::Denied
			);
		}
	}

	#[test]
	fn the_plugin_permission_answer_decodes_whole() {
		let permission: NotificationPermission = serde_json::from_value(
			serde_json::json!({ "granted": false, "state": "prompt-with-rationale" }),
		)
		.unwrap();
		assert_eq!(
			permission,
			NotificationPermission {
				granted: false,
				state: NotificationPermissionState::PromptWithRationale,
			}
		);
	}
}
