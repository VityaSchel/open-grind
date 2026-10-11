use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
use super::apple as platform;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use super::linux as platform;
#[cfg(target_os = "windows")]
use super::windows as platform;
use super::CHANGED_EVENT;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
	not(any(target_os = "macos", target_os = "windows")),
	allow(dead_code)
)]
pub enum HourCycle {
	H11,
	H12,
	H23,
	H24,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
	not(any(target_os = "macos", target_os = "windows")),
	allow(dead_code)
)]
pub enum DateOrder {
	Dmy,
	Mdy,
	Ymd,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MeasurementSystem {
	Metric,
	Us,
	Uk,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionalSettings {
	pub locale: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub number_locale: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub hour_cycle: Option<HourCycle>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub two_digit_hour: Option<bool>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub date_order: Option<DateOrder>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub decimal_separator: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub group_separator: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub numbering_system: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub first_day_of_week: Option<u8>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub measurement_system: Option<MeasurementSystem>,
}

#[derive(Default)]
pub struct LastRead(Mutex<Option<RegionalSettings>>);

impl LastRead {
	fn replace(&self, settings: &RegionalSettings) -> bool {
		let mut last = self.0.lock().unwrap();
		if last.as_ref() == Some(settings) {
			return false;
		}
		*last = Some(settings.clone());
		true
	}
}

pub fn refresh(app: &AppHandle) {
	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		let settings = platform::read().await;
		if app.state::<LastRead>().replace(&settings) {
			let _ = app.emit(CHANGED_EVENT, &settings);
		}
	});
}

pub fn refresh_on_focus(window: &tauri::WebviewWindow) {
	if window.label() != crate::MAIN_WINDOW_LABEL {
		return;
	}
	let app = window.app_handle().clone();
	window.on_window_event(move |event| {
		if matches!(event, tauri::WindowEvent::Focused(true)) {
			refresh(&app);
		}
	});
}

pub async fn current(app: &AppHandle) -> RegionalSettings {
	let settings = platform::read().await;
	app.state::<LastRead>().replace(&settings);
	settings
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_snapshot_serializes_as_the_frontend_reads_it() {
		let full = RegionalSettings {
			locale: "en-DE".into(),
			number_locale: Some("de-DE".into()),
			hour_cycle: Some(HourCycle::H23),
			two_digit_hour: Some(true),
			date_order: Some(DateOrder::Dmy),
			decimal_separator: Some(",".into()),
			group_separator: Some("\u{202f}".into()),
			numbering_system: Some("arab".into()),
			first_day_of_week: Some(1),
			measurement_system: Some(MeasurementSystem::Uk),
		};
		assert_eq!(
			serde_json::to_value(&full).unwrap(),
			serde_json::json!({
				"locale": "en-DE",
				"numberLocale": "de-DE",
				"hourCycle": "h23",
				"twoDigitHour": true,
				"dateOrder": "dmy",
				"decimalSeparator": ",",
				"groupSeparator": "\u{202f}",
				"numberingSystem": "arab",
				"firstDayOfWeek": 1,
				"measurementSystem": "uk",
			})
		);
		let bare = RegionalSettings {
			locale: "und".into(),
			..RegionalSettings::default()
		};
		assert_eq!(
			serde_json::to_value(&bare).unwrap(),
			serde_json::json!({ "locale": "und" })
		);
	}

	#[test]
	fn only_a_changed_snapshot_counts_as_new() {
		let last = LastRead::default();
		let german = RegionalSettings {
			locale: "de-DE".into(),
			..RegionalSettings::default()
		};
		let american = RegionalSettings {
			locale: "en-US".into(),
			hour_cycle: Some(HourCycle::H12),
			..RegionalSettings::default()
		};
		assert!(last.replace(&german));
		assert!(!last.replace(&german.clone()));
		assert!(last.replace(&american));
		assert!(last.replace(&german));
	}
}
