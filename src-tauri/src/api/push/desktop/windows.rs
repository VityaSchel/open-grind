use tauri::AppHandle;
use windows::core::{HRESULT, HSTRING};
use windows::Foundation::TypedEventHandler;
use windows::UI::Notifications::{
	NotificationSetting, ToastNotification, ToastNotificationManager,
	ToastTemplateType,
};

use super::super::{Announcement, NotificationPermission, PushError};

pub fn settings_url(_app: &AppHandle) -> Option<String> {
	Some("ms-settings:notifications".to_owned())
}

const GROUP: &str = "open-grind";
// ToastNotifier.Setting throws ERROR_NOT_FOUND until the app's first toast
// registers it, while toasts are already allowed by default
const NOT_REGISTERED_YET: HRESULT = HRESULT(0x8007_0490_u32 as i32);

fn app_id(app: &AppHandle) -> HSTRING {
	HSTRING::from(&app.config().identifier)
}

pub fn install(_app: &AppHandle) {}

fn toast(
	app: &AppHandle,
	announcement: &Announcement,
) -> windows::core::Result<()> {
	let content = ToastNotificationManager::GetTemplateContent(
		ToastTemplateType::ToastText02,
	)?;
	let lines = content.GetElementsByTagName(&HSTRING::from("text"))?;
	for (line, text) in (0..).zip([&announcement.title, &announcement.body]) {
		lines
			.Item(line)?
			.AppendChild(&content.CreateTextNode(&HSTRING::from(text))?)?;
	}
	let toast = ToastNotification::CreateToastNotification(&content)?;
	toast.SetTag(&HSTRING::from(&announcement.tag))?;
	toast.SetGroup(&HSTRING::from(GROUP))?;
	let clicked = app.clone();
	let tag = announcement.tag.clone();
	toast.Activated(&TypedEventHandler::new(move |_, _| {
		super::open(&clicked, &tag);
		Ok(())
	}))?;
	ToastNotificationManager::CreateToastNotifierWithId(&app_id(app))?
		.Show(&toast)
}

pub async fn show(
	app: &AppHandle,
	announcement: &Announcement,
) -> Result<(), PushError> {
	let app = app.clone();
	let announcement = announcement.clone();
	tauri::async_runtime::spawn_blocking(move || toast(&app, &announcement))
		.await
		.map_err(|_| PushError::Failed)?
		.map_err(|error| {
			tracing::warn!("[push] the toast was not shown: {error}");
			PushError::Failed
		})
}

pub fn withdraw(app: &AppHandle, tags: &[String]) {
	let app_id = app_id(app);
	let tags = tags.to_vec();
	tauri::async_runtime::spawn_blocking(move || {
		let Ok(history) = ToastNotificationManager::History() else {
			return;
		};
		for tag in tags {
			let _ = history.RemoveGroupedTagWithId(
				&HSTRING::from(tag),
				&HSTRING::from(GROUP),
				&app_id,
			);
		}
	});
}

pub async fn delivered(app: &AppHandle) -> Option<Vec<String>> {
	let app_id = app_id(app);
	tauri::async_runtime::spawn_blocking(move || {
		ToastNotificationManager::History()?
			.GetHistoryWithId(&app_id)?
			.into_iter()
			.map(|toast| toast.Tag().map(|tag| tag.to_string()))
			.collect::<windows::core::Result<Vec<String>>>()
	})
	.await
	.ok()?
	.ok()
}

pub async fn permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	let app_id = app_id(app);
	let setting = tauri::async_runtime::spawn_blocking(move || {
		ToastNotificationManager::CreateToastNotifierWithId(&app_id)?.Setting()
	})
	.await
	.map_err(|_| PushError::Failed)?;
	let enabled = match setting {
		Ok(setting) => setting == NotificationSetting::Enabled,
		Err(error) if error.code() == NOT_REGISTERED_YET => true,
		Err(_) => return Err(PushError::UnsupportedPlatform),
	};
	Ok(NotificationPermission::settled(enabled))
}

pub async fn request_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	permission(app).await
}
