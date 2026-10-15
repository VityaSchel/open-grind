use std::collections::HashMap;
use std::ffi::CString;

use gdk::glib::prelude::{ObjectExt, ObjectType};
use tauri::{AppHandle, Manager};
use zbus::blocking::{Connection, MessageIterator};
use zbus::message::Type;
use zbus::MatchRule;

use super::super::DesktopPush;
use super::{Notifications, DEFAULT_ACTION, PATH, SERVICE};

pub(super) fn subscribe(bus: &Connection) -> zbus::Result<MessageIterator> {
	let rule = MatchRule::builder()
		.msg_type(Type::Signal)
		.interface(SERVICE)?
		.path(PATH)?
		.build();
	MessageIterator::for_match_rule(rule, bus, None)
}

fn hand_over_activation(token: &str) {
	let Some(display) = gdk::Display::default() else {
		return;
	};
	if display.type_().name() != "GdkWaylandDisplay" {
		return;
	}
	let Ok(token) = CString::new(token) else {
		return;
	};
	unsafe {
		gdk_wayland_sys::gdk_wayland_display_set_startup_notification_id(
			display.as_ptr().cast(),
			token.as_ptr(),
		);
	}
}

fn open(app: &AppHandle, tag: String, token: Option<String>) {
	let handle = app.clone();
	let opened = app.run_on_main_thread(move || {
		if let Some(token) = token {
			hand_over_activation(&token);
		}
		super::super::open(&handle, &tag, None);
	});
	if let Err(error) = opened {
		tracing::warn!("[push] could not open the notification: {error}");
	}
}

pub(super) fn listen(app: AppHandle, signals: MessageIterator) {
	let mut tokens = HashMap::new();
	for signal in signals.flatten() {
		let header = signal.header();
		let Some(member) = header.member() else {
			continue;
		};
		let body = signal.body();
		let notifications = app.state::<Notifications>();
		match member.as_str() {
			"ActivationToken" => {
				if let Ok((id, token)) = body.deserialize::<(u32, String)>() {
					tokens.insert(id, token);
				}
			}
			"ActionInvoked" => {
				let Ok((id, action)) = body.deserialize::<(u32, String)>()
				else {
					continue;
				};
				let token = tokens.remove(&id);
				if action != DEFAULT_ACTION {
					continue;
				}
				if let Some(tag) = notifications.take_tag(id) {
					open(&app, tag, token);
				}
			}
			"NotificationClosed" => {
				if let Ok((id, _reason)) = body.deserialize::<(u32, u32)>() {
					tokens.remove(&id);
					if let Some(tag) = notifications.take_tag(id) {
						app.state::<DesktopPush>().withdraw(&tag, None);
					}
				}
			}
			_ => {}
		}
	}
}
