use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use zbus::blocking::Connection;
use zbus::zvariant::Value;

use super::super::{Announcement, NotificationPermission, PushError};

mod signals;

pub fn settings_url(_app: &AppHandle) -> Option<String> {
	None
}

const SERVICE: &str = "org.freedesktop.Notifications";
const PATH: &str = "/org/freedesktop/Notifications";
const DEFAULT_ACTION: &str = "default";
const SERVER_DEFAULT_TIMEOUT: i32 = -1;

struct Notifications {
	bus: Connection,
	shown: Mutex<HashMap<String, u32>>,
}

impl Notifications {
	fn take_tag(&self, id: u32) -> Option<String> {
		let mut shown = self.shown.lock().unwrap();
		let tag = shown.iter().find(|(_, shown)| **shown == id)?.0.clone();
		shown.remove(&tag);
		Some(tag)
	}
}

pub fn install(app: &AppHandle) {
	let bus = match Connection::session() {
		Ok(bus) => bus,
		Err(error) => {
			tracing::warn!(
				"[push] no session bus, notifications are off: {error}"
			);
			return;
		}
	};
	let signals = signals::subscribe(&bus);
	app.manage(Notifications {
		bus,
		shown: Mutex::new(HashMap::new()),
	});
	match signals {
		Ok(signals) => {
			let app = app.clone();
			std::thread::spawn(move || signals::listen(app, signals));
		}
		Err(error) => {
			tracing::warn!("[push] notification clicks are not heard: {error}");
		}
	}
}

fn desktop_entry(app: &AppHandle) -> String {
	if let Ok(flatpak) = std::env::var("FLATPAK_ID") {
		return flatpak;
	}
	match crate::appimage::path() {
		Some(_) => crate::desktop_entry::ENTRY_FILE
			.trim_end_matches(".desktop")
			.to_owned(),
		None => app.package_info().name.clone(),
	}
}

fn notify(app: &AppHandle, announcement: &Announcement) -> zbus::Result<()> {
	let Some(notifications) = app.try_state::<Notifications>() else {
		return Err(zbus::Error::Unsupported);
	};
	let mut shown = notifications.shown.lock().unwrap();
	let replaces = shown.get(&announcement.tag).copied().unwrap_or(0);
	let hints =
		HashMap::from([("desktop-entry", Value::from(desktop_entry(app)))]);
	let reply = notifications.bus.call_method(
		Some(SERVICE),
		PATH,
		Some(SERVICE),
		"Notify",
		&(
			app.package_info().name.as_str(),
			replaces,
			"",
			announcement.title.as_str(),
			announcement.body.as_str(),
			vec![DEFAULT_ACTION, ""],
			hints,
			SERVER_DEFAULT_TIMEOUT,
		),
	)?;
	shown.insert(announcement.tag.clone(), reply.body().deserialize()?);
	Ok(())
}

pub async fn show(
	app: &AppHandle,
	announcement: &Announcement,
) -> Result<(), PushError> {
	let app = app.clone();
	let announcement = announcement.clone();
	tauri::async_runtime::spawn_blocking(move || notify(&app, &announcement))
		.await
		.map_err(|_| PushError::Failed)?
		.map_err(|error| {
			tracing::warn!("[push] the notification was not shown: {error}");
			PushError::Failed
		})
}

pub fn withdraw(app: &AppHandle, tags: &[String]) {
	let Some(notifications) = app.try_state::<Notifications>() else {
		return;
	};
	let ids: Vec<u32> = {
		let mut shown = notifications.shown.lock().unwrap();
		tags.iter().filter_map(|tag| shown.remove(tag)).collect()
	};
	let bus = notifications.bus.clone();
	tauri::async_runtime::spawn_blocking(move || {
		for id in ids {
			let _ = bus.call_method(
				Some(SERVICE),
				PATH,
				Some(SERVICE),
				"CloseNotification",
				&(id,),
			);
		}
	});
}

pub async fn delivered(_app: &AppHandle) -> Option<Vec<String>> {
	None
}

pub async fn permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	app.try_state::<Notifications>()
		.map(|_| NotificationPermission::settled(true))
		.ok_or(PushError::UnsupportedPlatform)
}

pub async fn request_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	permission(app).await
}
