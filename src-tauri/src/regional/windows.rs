use windows::core::PCWSTR;
use windows::Win32::Globalization::{
	GetLocaleInfoEx, GetUserDefaultLocaleName, LOCALE_IFIRSTDAYOFWEEK,
	LOCALE_IMEASURE, LOCALE_RETURN_NUMBER, LOCALE_SDECIMAL, LOCALE_SSHORTDATE,
	LOCALE_SSHORTTIME, LOCALE_STHOUSAND,
};

use super::desktop::RegionalSettings;
use super::pattern;

const LOCALE_NAME_CAPACITY: usize = 85;
const INFO_CAPACITY: usize = 128;

fn utf16(buffer: &[u16], written: i32) -> Option<String> {
	let length = usize::try_from(written).ok()?.checked_sub(1)?;
	String::from_utf16(buffer.get(..length)?).ok()
}

fn user_locale_name() -> Option<String> {
	let mut buffer = [0u16; LOCALE_NAME_CAPACITY];
	let written = unsafe { GetUserDefaultLocaleName(&mut buffer) };
	utf16(&buffer, written)
}

fn user_text(kind: u32) -> Option<String> {
	let mut buffer = [0u16; INFO_CAPACITY];
	let written =
		unsafe { GetLocaleInfoEx(PCWSTR::null(), kind, Some(&mut buffer)) };
	utf16(&buffer, written).filter(|value| !value.is_empty())
}

fn user_number(kind: u32) -> Option<u32> {
	let mut buffer = [0u16; 2];
	let written = unsafe {
		GetLocaleInfoEx(
			PCWSTR::null(),
			kind | LOCALE_RETURN_NUMBER,
			Some(&mut buffer),
		)
	};
	(written == 2).then(|| u32::from(buffer[0]) | (u32::from(buffer[1]) << 16))
}

pub async fn read() -> RegionalSettings {
	let locale = user_locale_name()
		.map(|name| pattern::windows_locale_name(&name).to_owned())
		.filter(|name| !name.is_empty())
		.unwrap_or_else(|| "und".into());
	let short_time = user_text(LOCALE_SSHORTTIME);
	let measurement_system = user_number(LOCALE_IMEASURE).and_then(|measure| {
		pattern::windows_measurement_system(measure, &locale)
	});
	RegionalSettings {
		locale,
		number_locale: None,
		hour_cycle: short_time.as_deref().and_then(pattern::hour_cycle),
		two_digit_hour: short_time.as_deref().and_then(pattern::two_digit_hour),
		date_order: user_text(LOCALE_SSHORTDATE)
			.and_then(|date| pattern::date_order(&date)),
		decimal_separator: user_text(LOCALE_SDECIMAL),
		group_separator: user_text(LOCALE_STHOUSAND),
		numbering_system: None,
		first_day_of_week: user_number(LOCALE_IFIRSTDAYOFWEEK)
			.and_then(pattern::monday_zero_weekday),
		measurement_system,
	}
}
