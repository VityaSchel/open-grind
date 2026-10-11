use std::time::Duration;

use tokio::sync::OnceCell;
use zbus::zvariant::{OwnedValue, Value};
use zbus::Connection;

use super::desktop::{HourCycle, RegionalSettings};
use super::pattern;

const PORTAL_TIMEOUT: Duration = Duration::from_millis(250);

static SESSION_BUS: OnceCell<Connection> = OnceCell::const_new();

fn variable(name: &str) -> Option<String> {
	std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn category(name: &str) -> Option<String> {
	variable("LC_ALL")
		.or_else(|| variable(name))
		.or_else(|| variable("LANG"))
}

fn text(value: &Value) -> Option<String> {
	match value {
		Value::Str(text) => Some(text.as_str().to_owned()),
		Value::Value(inner) => text(inner),
		_ => None,
	}
}

async fn portal_setting(namespace: &str, key: &str) -> Option<String> {
	let bus = SESSION_BUS
		.get_or_try_init(Connection::session)
		.await
		.ok()?;
	for method in ["ReadOne", "Read"] {
		let value = bus
			.call_method(
				Some("org.freedesktop.portal.Desktop"),
				"/org/freedesktop/portal/desktop",
				Some("org.freedesktop.portal.Settings"),
				method,
				&(namespace, key),
			)
			.await
			.ok()
			.and_then(|reply| reply.body().deserialize::<OwnedValue>().ok())
			.and_then(|value| text(&value));
		if value.is_some() {
			return value;
		}
	}
	None
}

async fn clock_format() -> Option<HourCycle> {
	let setting = portal_setting("org.gnome.desktop.interface", "clock-format");
	let value = tokio::time::timeout(PORTAL_TIMEOUT, setting).await.ok()??;
	pattern::gnome_clock_format(&value)
}

pub async fn read() -> RegionalSettings {
	let locale = category("LC_TIME")
		.as_deref()
		.and_then(pattern::posix_locale);
	let number_locale = category("LC_NUMERIC")
		.as_deref()
		.and_then(pattern::posix_locale)
		.filter(|number_locale| Some(number_locale) != locale.as_ref());
	RegionalSettings {
		locale: locale.unwrap_or_else(|| "und".into()),
		number_locale,
		hour_cycle: clock_format().await,
		measurement_system: category("LC_MEASUREMENT")
			.as_deref()
			.and_then(pattern::posix_measurement_system),
		..RegionalSettings::default()
	}
}
