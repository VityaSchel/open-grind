use serde::{Deserialize, Serialize};
use tauri::plugin::mobile::PluginInvokeError;
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use super::{
	NotificationPermission, NotificationPermissionState, PushError, PushMode,
	PushSignal,
};

struct AndroidPush {
	handle: PluginHandle<Wry>,
}

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("push")
		.setup(|app, api| {
			let handle = api
				.register_android_plugin("org.opengrind.push", "PushPlugin")?;
			app.manage(AndroidPush { handle });
			Ok(())
		})
		.build()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModeRequest {
	mode: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchRequest {
	on_event: tauri::ipc::Channel<PushSignal>,
}

#[derive(Deserialize)]
struct TokenResponse {
	token: String,
}

#[derive(Deserialize)]
struct PermissionResponse {
	granted: bool,
	state: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnabledRequest {
	enabled: bool,
}

#[derive(Deserialize)]
struct EnabledResponse {
	enabled: bool,
}

#[derive(Deserialize)]
struct ModeResponse {
	mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CategoryRequest {
	category: String,
	enabled: bool,
}

#[derive(Deserialize)]
struct CategoriesResponse {
	categories: Vec<super::PushCategory>,
}

#[derive(Deserialize)]
struct DeeplinkResponse {
	deeplink: Option<String>,
}

pub async fn addon_ready(app: &AppHandle) -> Result<(), PushError> {
	call::<serde_json::Value>(app, "addonReady", ())
		.await
		.map(drop)
}

pub async fn token(app: &AppHandle) -> Result<String, PushError> {
	call::<TokenResponse>(app, "token", ())
		.await
		.map(|response| response.token)
}

pub async fn delete_token(app: &AppHandle) -> Result<(), PushError> {
	call::<serde_json::Value>(app, "deleteToken", ())
		.await
		.map(drop)
}

pub async fn notifications_enabled(app: &AppHandle) -> Result<bool, PushError> {
	call::<EnabledResponse>(app, "notificationsEnabled", ())
		.await
		.map(|response| response.enabled)
}

pub async fn set_notifications_enabled(
	app: &AppHandle,
	enabled: bool,
) -> Result<(), PushError> {
	call::<serde_json::Value>(
		app,
		"setNotificationsEnabled",
		EnabledRequest { enabled },
	)
	.await
	.map(drop)
}

pub async fn open_notification_settings(
	app: &AppHandle,
) -> Result<(), PushError> {
	call::<serde_json::Value>(app, "openNotificationSettings", ())
		.await
		.map(drop)
}

pub async fn mode(app: &AppHandle) -> Result<PushMode, PushError> {
	call::<ModeResponse>(app, "mode", ())
		.await
		.map(|response| PushMode::of(&response.mode))
}

pub async fn set_mode(
	app: &AppHandle,
	mode: PushMode,
) -> Result<(), PushError> {
	call::<serde_json::Value>(app, "setMode", ModeRequest { mode: mode.wire() })
		.await
		.map(drop)
}

pub async fn categories(
	app: &AppHandle,
) -> Result<Vec<super::PushCategory>, PushError> {
	call::<CategoriesResponse>(app, "categories", ())
		.await
		.map(|response| response.categories)
}

pub async fn set_category(
	app: &AppHandle,
	category: String,
	enabled: bool,
) -> Result<(), PushError> {
	call::<serde_json::Value>(
		app,
		"setCategory",
		CategoryRequest { category, enabled },
	)
	.await
	.map(drop)
}

pub async fn open_category_settings(
	app: &AppHandle,
	category: String,
) -> Result<(), PushError> {
	call::<serde_json::Value>(
		app,
		"openCategorySettings",
		CategoryRequest {
			category,
			enabled: true,
		},
	)
	.await
	.map(drop)
}

pub async fn notification_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	permission(app, "notificationPermission").await
}

pub async fn request_notification_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	permission(app, "requestNotificationPermission").await
}

async fn permission(
	app: &AppHandle,
	command: &str,
) -> Result<NotificationPermission, PushError> {
	call::<PermissionResponse>(app, command, ())
		.await
		.map(|response| NotificationPermission {
			granted: response.granted,
			state: NotificationPermissionState::of(&response.state),
		})
}

pub async fn take_deeplink(
	app: &AppHandle,
) -> Result<Option<String>, PushError> {
	call::<DeeplinkResponse>(app, "takeDeeplink", ())
		.await
		.map(|response| response.deeplink)
}

pub fn watch(
	app: &AppHandle,
	on_event: tauri::ipc::Channel<PushSignal>,
) -> Result<(), PushError> {
	handle(app)?
		.run_mobile_plugin::<serde_json::Value>(
			"watchPush",
			WatchRequest { on_event },
		)
		.map(drop)
		.map_err(rejection)
}

async fn call<T: serde::de::DeserializeOwned>(
	app: &AppHandle,
	command: &str,
	payload: impl Serialize,
) -> Result<T, PushError> {
	handle(app)?
		.run_mobile_plugin_async(command, payload)
		.await
		.map_err(rejection)
}

fn handle(app: &AppHandle) -> Result<PluginHandle<Wry>, PushError> {
	Ok(app
		.try_state::<AndroidPush>()
		.ok_or(PushError::Failed)?
		.handle
		.clone())
}

fn rejection(error: PluginInvokeError) -> PushError {
	match error {
		PluginInvokeError::InvokeRejected(response) => {
			PushError::from_rejection(
				response.message.as_deref(),
				response.code.as_deref(),
			)
		}
		_ => PushError::Failed,
	}
}
