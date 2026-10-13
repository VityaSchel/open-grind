#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
use crate::regional::posix_locale;

#[cfg(any(target_os = "macos", test))]
pub fn is_language_tag(tag: &str) -> bool {
	let mut subtags = tag.split('-');
	let language = subtags.next().unwrap_or_default();
	(2..=8).contains(&language.len())
		&& language.chars().all(|c| c.is_ascii_alphabetic())
		&& subtags.all(|subtag| {
			(1..=8).contains(&subtag.len())
				&& subtag.chars().all(|c| c.is_ascii_alphanumeric())
		})
}

#[cfg(any(not(any(target_os = "macos", target_os = "windows")), test))]
pub fn posix_languages(
	variable: impl Fn(&str) -> Option<String>,
) -> Vec<String> {
	let set = |name: &str| variable(name).filter(|value| !value.is_empty());
	let Some(messages) =
		["LC_ALL", "LC_MESSAGES", "LANG"].into_iter().find_map(set)
	else {
		return Vec::new();
	};
	if matches!(messages.as_str(), "C" | "POSIX") {
		return Vec::new();
	}
	let preferred = set("LANGUAGE").unwrap_or_default();
	let mut languages = Vec::new();
	for tag in preferred
		.split(':')
		.chain([messages.as_str()])
		.filter_map(posix_locale)
	{
		if !languages.contains(&tag) {
			languages.push(tag);
		}
	}
	languages
}

#[cfg(any(target_os = "windows", test))]
pub fn multi_string(buffer: &[u16]) -> Vec<String> {
	buffer
		.split(|&unit| unit == 0)
		.filter(|name| !name.is_empty())
		.filter_map(|name| String::from_utf16(name).ok())
		.collect()
}

#[cfg(test)]
mod tests {
	use std::collections::HashMap;

	use super::*;

	fn languages(variables: &[(&str, &str)]) -> Vec<String> {
		let variables: HashMap<&str, &str> =
			variables.iter().copied().collect();
		posix_languages(|name| variables.get(name).map(|&value| value.into()))
	}

	#[test]
	fn the_language_list_comes_before_the_messages_locale() {
		assert_eq!(
			languages(&[("LANGUAGE", "fr_CA:de"), ("LANG", "fr_CA.UTF-8")]),
			["fr-CA", "de"]
		);
		assert_eq!(
			languages(&[("LANGUAGE", "pt_BR"), ("LANG", "en_US.UTF-8")]),
			["pt-BR", "en-US"]
		);
		assert_eq!(
			languages(&[("LANGUAGE", ""), ("LANG", "de_AT.UTF-8")]),
			["de-AT"]
		);
		assert_eq!(
			languages(&[
				("LANGUAGE", "fr::en_GB:bogus-tag:fr"),
				("LANG", "fr_FR.UTF-8")
			]),
			["fr", "en-GB", "fr-FR"]
		);
	}

	#[test]
	fn the_messages_locale_follows_posix_precedence() {
		assert_eq!(
			languages(&[
				("LC_ALL", "es_MX.UTF-8"),
				("LC_MESSAGES", "de_DE.UTF-8"),
				("LANG", "fr_FR.UTF-8"),
			]),
			["es-MX"]
		);
		assert_eq!(
			languages(&[
				("LC_ALL", ""),
				("LC_MESSAGES", "de_DE.UTF-8"),
				("LANG", "fr_FR.UTF-8"),
			]),
			["de-DE"]
		);
		assert_eq!(languages(&[("LANG", "sr_RS@latin")]), ["sr-Latn-RS"]);
	}

	#[test]
	fn the_c_locale_names_no_language() {
		assert!(languages(&[]).is_empty());
		assert!(
			languages(&[("LANGUAGE", "fr:de")]).is_empty(),
			"gettext ignores LANGUAGE without a messages locale"
		);
		assert!(languages(&[("LANG", "C")]).is_empty());
		assert!(languages(&[("LANG", "POSIX")]).is_empty());
		assert!(languages(&[("LANG", "C.UTF-8")]).is_empty());
		assert!(
			languages(&[
				("LANGUAGE", "de"),
				("LC_ALL", "C"),
				("LANG", "de_DE")
			])
			.is_empty(),
			"gettext ignores LANGUAGE under the C locale"
		);
		assert_eq!(
			languages(&[("LANGUAGE", "de"), ("LANG", "C.UTF-8")]),
			["de"]
		);
	}

	#[test]
	fn windows_lists_its_languages_as_a_double_terminated_string() {
		let encoded: Vec<u16> =
			"en-US\0de-DE\0zh-Hant-TW\0\0".encode_utf16().collect();
		assert_eq!(multi_string(&encoded), ["en-US", "de-DE", "zh-Hant-TW"]);
		assert!(multi_string(&[0, 0]).is_empty());
		assert!(multi_string(&[]).is_empty());
		assert_eq!(
			multi_string(&[0xd800, 0, u16::from(b'f'), u16::from(b'r'), 0, 0]),
			["fr"]
		);
	}

	#[test]
	fn only_well_formed_tags_are_written() {
		for tag in ["en", "en-US", "es-419", "zh-Hant-TW", "sr-Latn-RS", "fil"]
		{
			assert!(is_language_tag(tag), "{tag}");
		}
		for tag in [
			"",
			"e",
			"en_US",
			"en--US",
			"-en",
			"en-",
			"1en",
			"en-toolongsub",
			"日本",
			"en US",
		] {
			assert!(!is_language_tag(tag), "{tag}");
		}
	}
}
