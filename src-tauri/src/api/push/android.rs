use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};

use super::{
	NotificationPermission, PushCategory, PushError, PushMode, PushSignal,
};
use crate::plugin_rejection::classify;

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

#[derive(Serialize, Deserialize)]
struct ModePayload {
	mode: PushMode,
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

#[derive(Serialize)]
struct EnabledRequest {
	enabled: bool,
}

#[derive(Deserialize)]
struct EnabledResponse {
	enabled: bool,
}

#[derive(Serialize)]
struct CategoryRequest {
	category: String,
	enabled: bool,
}

#[derive(Serialize)]
struct CategoryName {
	category: String,
}

#[derive(Deserialize)]
struct CategoriesResponse {
	categories: Vec<PushCategory>,
}

#[derive(Deserialize)]
struct DeeplinkResponse {
	deeplink: Option<String>,
}

pub async fn addon_ready(app: &AppHandle) -> Result<(), PushError> {
	run(app, "addonReady", ()).await
}

pub async fn token(app: &AppHandle) -> Result<String, PushError> {
	call::<TokenResponse>(app, "token", ())
		.await
		.map(|response| response.token)
}

pub async fn delete_token(app: &AppHandle) -> Result<(), PushError> {
	run(app, "deleteToken", ()).await
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
	run(app, "setNotificationsEnabled", EnabledRequest { enabled }).await
}

pub async fn open_notification_settings(
	app: &AppHandle,
) -> Result<(), PushError> {
	run(app, "openNotificationSettings", ()).await
}

pub async fn mode(app: &AppHandle) -> Result<PushMode, PushError> {
	call::<ModePayload>(app, "mode", ())
		.await
		.map(|response| response.mode)
}

pub async fn set_mode(
	app: &AppHandle,
	mode: PushMode,
) -> Result<(), PushError> {
	run(app, "setMode", ModePayload { mode }).await
}

pub async fn categories(
	app: &AppHandle,
) -> Result<Vec<PushCategory>, PushError> {
	call::<CategoriesResponse>(app, "categories", ())
		.await
		.map(|response| response.categories)
}

pub async fn set_category(
	app: &AppHandle,
	category: String,
	enabled: bool,
) -> Result<(), PushError> {
	run(app, "setCategory", CategoryRequest { category, enabled }).await
}

pub async fn open_category_settings(
	app: &AppHandle,
	category: String,
) -> Result<(), PushError> {
	run(app, "openCategorySettings", CategoryName { category }).await
}

pub async fn notification_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	call(app, "notificationPermission", ()).await
}

pub async fn request_notification_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	call(app, "requestNotificationPermission", ()).await
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
		.map_err(|error| classify(error, PushError::from_rejection))
}

async fn run(
	app: &AppHandle,
	command: &str,
	payload: impl Serialize,
) -> Result<(), PushError> {
	call::<serde_json::Value>(app, command, payload)
		.await
		.map(drop)
}

async fn call<T: serde::de::DeserializeOwned>(
	app: &AppHandle,
	command: &str,
	payload: impl Serialize,
) -> Result<T, PushError> {
	handle(app)?
		.run_mobile_plugin_async(command, payload)
		.await
		.map_err(|error| classify(error, PushError::from_rejection))
}

fn handle(app: &AppHandle) -> Result<PluginHandle<Wry>, PushError> {
	Ok(app
		.try_state::<AndroidPush>()
		.ok_or(PushError::Failed)?
		.handle
		.clone())
}
