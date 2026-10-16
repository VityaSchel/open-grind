mod activator;

pub use activator::install;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use windows::core::{h, HRESULT, HSTRING};
use windows::Data::Xml::Dom::XmlDocument;
use windows::UI::Notifications::{
	NotificationSetting, ToastNotification, ToastNotificationManager,
};

use super::super::{Announcement, NotificationPermission, PushError};

pub fn settings_url(_app: &AppHandle) -> Option<String> {
	Some("ms-settings:notifications".to_owned())
}

const GROUP: &str = "open-grind";
// ToastNotifier.Setting throws ERROR_NOT_FOUND until the app's first toast
// registers it, while toasts are already allowed by default
const NOT_REGISTERED_YET: HRESULT = HRESULT(0x8007_0490_u32 as i32);

#[derive(Serialize, Deserialize)]
struct Launch {
	tag: String,
	deeplink: String,
}

fn app_id(app: &AppHandle) -> HSTRING {
	HSTRING::from(&app.config().identifier)
}

fn activated(app: &AppHandle, arguments: &str) {
	if let Ok(launch) = serde_json::from_str::<Launch>(arguments) {
		super::open(app, &launch.tag, Some(launch.deeplink));
	}
	// A toast that starts the app activates before setup creates the window
	let handle = app.clone();
	if let Err(error) =
		app.run_on_main_thread(move || crate::focus_main_window(&handle))
	{
		tracing::warn!("[push] could not focus the window: {error}");
	}
}

fn content(announcement: &Announcement) -> windows::core::Result<XmlDocument> {
	let launch = serde_json::to_string(&Launch {
		tag: announcement.tag.clone(),
		deeplink: announcement.deeplink.clone(),
	})
	.unwrap_or_default();
	let document = XmlDocument::new()?;
	let toast = document.CreateElement(h!("toast"))?;
	toast.SetAttribute(h!("launch"), &HSTRING::from(launch))?;
	let visual = document.CreateElement(h!("visual"))?;
	let binding = document.CreateElement(h!("binding"))?;
	binding.SetAttribute(h!("template"), h!("ToastGeneric"))?;
	for text in [&announcement.title, &announcement.body] {
		let line = document.CreateElement(h!("text"))?;
		line.AppendChild(&document.CreateTextNode(&HSTRING::from(text))?)?;
		binding.AppendChild(&line)?;
	}
	visual.AppendChild(&binding)?;
	toast.AppendChild(&visual)?;
	document.AppendChild(&toast)?;
	Ok(document)
}

fn toast(
	app: &AppHandle,
	announcement: &Announcement,
) -> windows::core::Result<()> {
	let toast =
		ToastNotification::CreateToastNotification(&content(announcement)?)?;
	toast.SetTag(&HSTRING::from(&announcement.tag))?;
	toast.SetGroup(&HSTRING::from(GROUP))?;
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
