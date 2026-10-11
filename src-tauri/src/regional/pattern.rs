#[cfg(any(target_os = "macos", target_os = "windows", test))]
use super::desktop::DateOrder;
use super::desktop::{HourCycle, MeasurementSystem};

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn unquoted(pattern: &str) -> Vec<char> {
	let mut quoted = false;
	pattern
		.chars()
		.filter(|&letter| {
			if letter == '\'' {
				quoted = !quoted;
				return false;
			}
			!quoted
		})
		.collect()
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
pub fn hour_cycle(pattern: &str) -> Option<HourCycle> {
	unquoted(pattern)
		.into_iter()
		.find_map(|letter| match letter {
			'K' => Some(HourCycle::H11),
			'h' => Some(HourCycle::H12),
			'H' => Some(HourCycle::H23),
			'k' => Some(HourCycle::H24),
			_ => None,
		})
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
pub fn two_digit_hour(pattern: &str) -> Option<bool> {
	unquoted(pattern)
		.chunk_by(|a, b| a == b)
		.find(|run| matches!(run[0], 'h' | 'H' | 'k' | 'K'))
		.map(|run| run.len() >= 2)
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
pub fn date_order(pattern: &str) -> Option<DateOrder> {
	let mut order = String::new();
	for run in unquoted(pattern).chunk_by(|a, b| a == b) {
		let field = match run[0] {
			'd' if run.len() <= 2 => 'd',
			'M' | 'L' => 'm',
			'y' | 'Y' | 'u' => 'y',
			_ => continue,
		};
		if !order.contains(field) {
			order.push(field);
		}
	}
	match order.as_str() {
		"dmy" => Some(DateOrder::Dmy),
		"mdy" => Some(DateOrder::Mdy),
		"ymd" => Some(DateOrder::Ymd),
		_ => None,
	}
}

#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
struct PosixLocale<'a> {
	language: &'a str,
	script: Option<&'static str>,
	territory: Option<&'a str>,
}

#[cfg(any(not(target_os = "macos"), test))]
fn is_territory(code: &str) -> bool {
	(code.len() == 2 && code.chars().all(|c| c.is_ascii_alphabetic()))
		|| (code.len() == 3 && code.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
fn parse_posix(value: &str) -> Option<PosixLocale<'_>> {
	let (name, modifier) = match value.split_once('@') {
		Some((name, modifier)) => (name, Some(modifier)),
		None => (value, None),
	};
	let name = name.split('.').next().unwrap_or_default();
	let (language, territory) = match name.split_once('_') {
		Some((language, territory)) => (language, Some(territory)),
		None => (name, None),
	};
	let language_valid = (2..=3).contains(&language.len())
		&& language.chars().all(|c| c.is_ascii_alphabetic());
	if !language_valid || !territory.is_none_or(is_territory) {
		return None;
	}
	let script = match modifier {
		Some("latin") => Some("Latn"),
		Some("cyrillic") => Some("Cyrl"),
		Some("devanagari") => Some("Deva"),
		_ => None,
	};
	Some(PosixLocale {
		language,
		script,
		territory,
	})
}

#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
pub fn posix_locale(value: &str) -> Option<String> {
	let PosixLocale {
		language,
		script,
		territory,
	} = parse_posix(value)?;
	let mut tag = language.to_ascii_lowercase();
	for subtag in [
		script.map(str::to_owned),
		territory.map(str::to_ascii_uppercase),
	]
	.into_iter()
	.flatten()
	{
		tag.push('-');
		tag.push_str(&subtag);
	}
	Some(tag)
}

#[cfg(any(not(target_os = "macos"), test))]
pub fn region_measurement_system(region: &str) -> MeasurementSystem {
	match region.to_ascii_uppercase().as_str() {
		"US" | "LR" | "MM" => MeasurementSystem::Us,
		"GB" => MeasurementSystem::Uk,
		_ => MeasurementSystem::Metric,
	}
}

#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
pub fn posix_measurement_system(value: &str) -> Option<MeasurementSystem> {
	parse_posix(value)?.territory.map(region_measurement_system)
}

#[cfg(any(target_os = "macos", test))]
pub fn apple_measurement_system(name: &str) -> Option<MeasurementSystem> {
	match name {
		"Metric" => Some(MeasurementSystem::Metric),
		"U.S." => Some(MeasurementSystem::Us),
		"U.K." => Some(MeasurementSystem::Uk),
		_ => None,
	}
}

#[cfg(any(target_os = "windows", test))]
pub fn windows_measurement_system(
	measure: u32,
	locale_name: &str,
) -> Option<MeasurementSystem> {
	let region = locale_name
		.split('-')
		.skip(1)
		.find(|code| is_territory(code));
	match (measure, region.map(region_measurement_system)) {
		(0, Some(MeasurementSystem::Uk)) => Some(MeasurementSystem::Uk),
		(0, _) => Some(MeasurementSystem::Metric),
		(1, _) => Some(MeasurementSystem::Us),
		_ => None,
	}
}

#[cfg(any(target_os = "windows", test))]
pub fn windows_locale_name(name: &str) -> &str {
	name.split('_').next().unwrap_or_default()
}

#[cfg(any(target_os = "macos", test))]
pub fn sunday_first_weekday(day: usize) -> Option<u8> {
	(1..=7)
		.contains(&day)
		.then(|| u8::try_from((day + 5) % 7 + 1).ok())
		.flatten()
}

#[cfg(any(target_os = "windows", test))]
pub fn monday_zero_weekday(day: u32) -> Option<u8> {
	(day <= 6).then(|| u8::try_from(day + 1).ok()).flatten()
}

#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
pub fn gnome_clock_format(value: &str) -> Option<HourCycle> {
	match value {
		"24h" => Some(HourCycle::H23),
		"12h" => Some(HourCycle::H12),
		_ => None,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_first_hour_field_outside_quotes_names_the_cycle() {
		for (pattern, cycle) in [
			("HH", HourCycle::H23),
			("h\u{a0}a", HourCycle::H12),
			("K a", HourCycle::H11),
			("kk", HourCycle::H24),
			("h:mm tt", HourCycle::H12),
			("tt h:mm", HourCycle::H12),
			("H:mm", HourCycle::H23),
			("HH:mm", HourCycle::H23),
			("H 'h' mm", HourCycle::H23),
			("'o''clock' h", HourCycle::H12),
			("'h' HH:mm", HourCycle::H23),
		] {
			assert_eq!(hour_cycle(pattern), Some(cycle), "{pattern}");
		}
		assert_eq!(hour_cycle("mm:ss"), None);
		assert_eq!(hour_cycle("'HH'"), None);
		assert_eq!(hour_cycle(""), None);
	}

	#[test]
	fn the_first_hour_field_outside_quotes_says_whether_hours_are_padded() {
		for (pattern, padded) in [
			("HH:mm", true),
			("H:mm", false),
			("hh:mm tt", true),
			("h:mm tt", false),
			("tt hh:mm", true),
			("H.mm", false),
			("HH' h 'mm", true),
			("'hh' H:mm", false),
			("kk:mm", true),
			("K:mm a", false),
			("h\u{a0}a", false),
		] {
			assert_eq!(two_digit_hour(pattern), Some(padded), "{pattern}");
		}
		assert_eq!(two_digit_hour("mm:ss"), None);
		assert_eq!(two_digit_hour("'HH'"), None);
		assert_eq!(two_digit_hour(""), None);
	}

	#[test]
	fn the_numeric_fields_name_the_date_order() {
		for (pattern, order) in [
			("dd.MM.y", DateOrder::Dmy),
			("d/M/yy", DateOrder::Dmy),
			("M/d/yy", DateOrder::Mdy),
			("y/MM/dd", DateOrder::Ymd),
			("y-MM-dd", DateOrder::Ymd),
			("dd/MM/yyyy", DateOrder::Dmy),
			("M/d/yyyy", DateOrder::Mdy),
			("yyyy-MM-dd", DateOrder::Ymd),
			("dddd, M/d/yyyy", DateOrder::Mdy),
			("d 'de' MMMM 'de' y", DateOrder::Dmy),
			("LL/dd/uuuu", DateOrder::Mdy),
		] {
			assert_eq!(date_order(pattern), Some(order), "{pattern}");
		}
		assert_eq!(date_order("MM/yy"), None);
		assert_eq!(date_order("y/dd/MM"), None);
		assert_eq!(date_order(""), None);
	}

	#[test]
	fn posix_names_become_language_tags() {
		for (value, tag) in [
			("de_DE.UTF-8", "de-DE"),
			("en_US", "en-US"),
			("de_DE@euro", "de-DE"),
			("sr_RS.UTF-8@latin", "sr-Latn-RS"),
			("es_419.UTF-8", "es-419"),
			("eo", "eo"),
			("ast_ES.utf8", "ast-ES"),
		] {
			assert_eq!(posix_locale(value).as_deref(), Some(tag), "{value}");
		}
		for value in ["C", "C.UTF-8", "POSIX", "", "en_USA", "e1_US"] {
			assert_eq!(posix_locale(value), None, "{value}");
		}
	}

	#[test]
	fn the_territory_names_the_measurement_system() {
		assert_eq!(
			posix_measurement_system("en_US.UTF-8"),
			Some(MeasurementSystem::Us)
		);
		assert_eq!(
			posix_measurement_system("my_MM"),
			Some(MeasurementSystem::Us)
		);
		assert_eq!(
			posix_measurement_system("en_GB.UTF-8"),
			Some(MeasurementSystem::Uk)
		);
		assert_eq!(
			posix_measurement_system("de_DE.UTF-8"),
			Some(MeasurementSystem::Metric)
		);
		assert_eq!(posix_measurement_system("en"), None);
		assert_eq!(posix_measurement_system("C.UTF-8"), None);
	}

	#[test]
	fn platform_measurement_values_map_to_systems() {
		assert_eq!(
			apple_measurement_system("Metric"),
			Some(MeasurementSystem::Metric)
		);
		assert_eq!(
			apple_measurement_system("U.S."),
			Some(MeasurementSystem::Us)
		);
		assert_eq!(
			apple_measurement_system("U.K."),
			Some(MeasurementSystem::Uk)
		);
		assert_eq!(apple_measurement_system("Imperial"), None);
	}

	#[test]
	fn windows_measurement_follows_the_setting_and_a_british_region() {
		for (measure, name, system) in [
			(0, "de-DE", Some(MeasurementSystem::Metric)),
			(0, "en-GB", Some(MeasurementSystem::Uk)),
			(0, "cy-GB", Some(MeasurementSystem::Uk)),
			(0, "sr-Latn-RS", Some(MeasurementSystem::Metric)),
			(0, "en-US", Some(MeasurementSystem::Metric)),
			(0, "en", Some(MeasurementSystem::Metric)),
			(1, "en-US", Some(MeasurementSystem::Us)),
			(1, "en-GB", Some(MeasurementSystem::Us)),
			(2, "en-GB", None),
		] {
			assert_eq!(
				windows_measurement_system(measure, name),
				system,
				"{measure} {name}"
			);
		}
	}

	#[test]
	fn windows_names_lose_their_sort_suffix() {
		assert_eq!(windows_locale_name("de-DE_phoneb"), "de-DE");
		assert_eq!(windows_locale_name("sr-Latn-RS"), "sr-Latn-RS");
		assert_eq!(windows_locale_name(""), "");
	}

	#[test]
	fn weekdays_count_from_monday() {
		let apple: Vec<_> = (0..=8).map(sunday_first_weekday).collect();
		assert_eq!(
			apple,
			[
				None,
				Some(7),
				Some(1),
				Some(2),
				Some(3),
				Some(4),
				Some(5),
				Some(6),
				None
			]
		);
		let windows: Vec<_> = (0..=7).map(monday_zero_weekday).collect();
		assert_eq!(
			windows,
			[
				Some(1),
				Some(2),
				Some(3),
				Some(4),
				Some(5),
				Some(6),
				Some(7),
				None
			]
		);
	}

	#[test]
	fn gnome_clock_formats_map_to_cycles() {
		assert_eq!(gnome_clock_format("24h"), Some(HourCycle::H23));
		assert_eq!(gnome_clock_format("12h"), Some(HourCycle::H12));
		assert_eq!(gnome_clock_format("auto"), None);
	}
}
