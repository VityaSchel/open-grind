#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod state;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
use linux as system;
#[cfg(target_os = "macos")]
use macos as system;
#[cfg(target_os = "windows")]
use windows as system;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

use super::{
	Announcement, Category, NotificationPermission, PushCategory, PushError,
	PushMode, PushSignal,
};
use state::DesktopPush;

const CATEGORIES_FILE: &str = "notification-categories.json";

pub fn plugin() -> TauriPlugin<Wry> {
	Builder::new("push")
		.setup(|app, _api| {
			let categories_file =
				app.path().app_local_data_dir()?.join(CATEGORIES_FILE);
			app.manage(DesktopPush::load(categories_file));
			system::install(app);
			Ok(())
		})
		.build()
}

fn open(app: &AppHandle, tag: &str, carried: Option<String>) {
	if app.state::<DesktopPush>().open(tag, carried) {
		crate::focus_main_window(app);
	}
}

fn main_window_focused(app: &AppHandle) -> bool {
	app.get_webview_window(crate::MAIN_WINDOW_LABEL)
		.and_then(|window| window.is_focused().ok())
		.unwrap_or(false)
}

pub async fn addon_ready(_app: &AppHandle) -> Result<(), PushError> {
	Err(PushError::UnsupportedPlatform)
}

pub async fn token(_app: &AppHandle) -> Result<String, PushError> {
	Err(PushError::UnsupportedPlatform)
}

pub async fn delete_token(_app: &AppHandle) -> Result<(), PushError> {
	Err(PushError::UnsupportedPlatform)
}

pub async fn notifications_enabled(app: &AppHandle) -> Result<bool, PushError> {
	Ok(app.state::<DesktopPush>().enabled())
}

pub async fn set_notifications_enabled(
	app: &AppHandle,
	enabled: bool,
) -> Result<(), PushError> {
	let mut withdrawn = app.state::<DesktopPush>().set_enabled(enabled);
	if !enabled {
		withdrawn.extend(system::delivered(app).await.unwrap_or_default());
	}
	system::withdraw(app, &withdrawn);
	Ok(())
}

pub async fn open_notification_settings(
	app: &AppHandle,
) -> Result<(), PushError> {
	let url =
		system::settings_url(app).ok_or(PushError::UnsupportedPlatform)?;
	app.opener().open_url(&url, None::<&str>).map_err(|error| {
		tracing::warn!("[push] could not open {url}: {error}");
		PushError::Failed
	})
}

pub async fn dismiss_conversation(
	app: &AppHandle,
	conversation_id: String,
	message_id: Option<String>,
) -> Result<(), PushError> {
	let push = app.state::<DesktopPush>();
	let showing = push.withdraw(&conversation_id, message_id.as_deref());
	if showing || message_id.is_none() {
		system::withdraw(app, &[conversation_id]);
	}
	Ok(())
}

pub async fn shown_conversations(
	app: &AppHandle,
) -> Result<Vec<String>, PushError> {
	Ok(match system::delivered(app).await {
		Some(tags) => tags,
		None => app.state::<DesktopPush>().shown_tags(),
	})
}

pub async fn mode(_app: &AppHandle) -> Result<PushMode, PushError> {
	Ok(PushMode::Slow)
}

pub async fn set_mode(
	_app: &AppHandle,
	_mode: PushMode,
) -> Result<(), PushError> {
	Err(PushError::UnsupportedPlatform)
}

pub async fn categories(
	app: &AppHandle,
) -> Result<Vec<PushCategory>, PushError> {
	Ok(app.state::<DesktopPush>().categories())
}

pub async fn set_category(
	app: &AppHandle,
	category: String,
	enabled: bool,
) -> Result<(), PushError> {
	let category = Category::named(&category).ok_or(PushError::Failed)?;
	app.state::<DesktopPush>()
		.set_category(category, enabled)
		.map_err(|error| {
			tracing::warn!("[push] could not save the categories: {error}");
			PushError::Failed
		})
}

pub async fn open_category_settings(
	_app: &AppHandle,
	_category: String,
) -> Result<(), PushError> {
	Err(PushError::UnsupportedPlatform)
}

pub async fn notification_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	system::permission(app).await
}

pub async fn request_notification_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	system::request_permission(app).await
}

pub async fn notify(
	app: &AppHandle,
	announcement: Announcement,
) -> Result<(), PushError> {
	let push = app.state::<DesktopPush>();
	if !push.admits(&announcement) || main_window_focused(app) {
		return Ok(());
	}
	push.record(&announcement);
	if let Err(error) = system::show(app, &announcement).await {
		push.withdraw(&announcement.tag, None);
		return Err(error);
	}
	if !push.enabled() {
		system::withdraw(app, &[announcement.tag]);
	}
	Ok(())
}

pub async fn take_deeplink(
	app: &AppHandle,
) -> Result<Option<String>, PushError> {
	Ok(app.state::<DesktopPush>().take_deeplink())
}

pub async fn deeplink_pending(app: &AppHandle) -> Result<bool, PushError> {
	Ok(app.state::<DesktopPush>().deeplink_pending())
}

pub fn watch(
	app: &AppHandle,
	on_event: tauri::ipc::Channel<PushSignal>,
) -> Result<(), PushError> {
	app.state::<DesktopPush>().watch(on_event);
	Ok(())
}
