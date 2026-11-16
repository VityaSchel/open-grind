mod matcher;

use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

use serde::Deserialize;

use matcher::{Matcher, Matching};

const SOURCE_CATALOG: &str = "en";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeText {
	#[cfg_attr(
		not(any(target_os = "windows", target_os = "linux")),
		allow(dead_code)
	)]
	WebViewWarningTitle,
	#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
	WebView2Description,
	#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
	WebView2Update,
	#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
	WebKitGtkDescription,
	#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
	WebKitGtkUpdate,
	#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
	PredecessorTitle,
	#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
	PredecessorDescription,
	#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
	PredecessorQuit,
	#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
	LocationTitle,
	#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
	LocationDescription,
	#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
	LocationQuit,
	GoogleSignInTitle,
	FacebookSignInTitle,
}

impl NativeText {
	const fn name(self) -> &'static str {
		match self {
			Self::WebViewWarningTitle => "webview_warning_title",
			Self::WebView2Description => "webview2_description",
			Self::WebView2Update => "webview2_update",
			Self::WebKitGtkDescription => "webkitgtk_description",
			Self::WebKitGtkUpdate => "webkitgtk_update",
			Self::PredecessorTitle => "predecessor_title",
			Self::PredecessorDescription => "predecessor_description",
			Self::PredecessorQuit => "predecessor_quit",
			Self::LocationTitle => "location_title",
			Self::LocationDescription => "location_description",
			Self::LocationQuit => "location_quit",
			Self::GoogleSignInTitle => "google_sign_in_title",
			Self::FacebookSignInTitle => "facebook_sign_in_title",
		}
	}
}

type Texts = HashMap<String, String>;

#[derive(Deserialize)]
struct CatalogsFile {
	matching: Matching,
	catalogs: BTreeMap<String, Texts>,
}

struct Catalogs {
	matcher: Matcher,
	texts: BTreeMap<String, Texts>,
}

impl Catalogs {
	fn parse(json: &str) -> serde_json::Result<Self> {
		let CatalogsFile { matching, catalogs } = serde_json::from_str(json)?;
		Ok(Self {
			matcher: Matcher::new(matching, catalogs.keys().cloned()),
			texts: catalogs,
		})
	}

	fn pick<S: AsRef<str>>(
		&self,
		languages: impl IntoIterator<Item = S>,
	) -> &str {
		languages
			.into_iter()
			.find_map(|tag| self.matcher.catalog_for(tag.as_ref()))
			.unwrap_or(SOURCE_CATALOG)
	}

	fn text<'a>(&'a self, catalog: &str, text: NativeText) -> &'a str {
		[catalog, SOURCE_CATALOG]
			.into_iter()
			.find_map(|id| self.texts.get(id)?.get(text.name()))
			.map_or(text.name(), String::as_str)
	}
}

fn catalogs() -> &'static Catalogs {
	static CATALOGS: OnceLock<Catalogs> = OnceLock::new();
	CATALOGS.get_or_init(|| {
		Catalogs::parse(include_str!("catalogs.json"))
			.expect("catalogs.json is not what bun run gen:i18n writes")
	})
}

fn fill(template: &str, values: &[(&str, &str)]) -> String {
	let mut filled = String::with_capacity(template.len());
	let mut rest = template;
	while let Some(start) = rest.find("{{") {
		let Some(length) = rest[start + 2..].find("}}") else {
			break;
		};
		let end = start + length + 4;
		let name = &rest[start + 2..end - 2];
		filled.push_str(&rest[..start]);
		match values.iter().find(|(key, _)| *key == name) {
			Some((_, value)) => filled.push_str(value),
			None => filled.push_str(&rest[start..end]),
		}
		rest = &rest[end..];
	}
	filled.push_str(rest);
	filled
}

pub struct NativeStrings {
	catalog: &'static str,
}

impl NativeStrings {
	pub fn pick<S: AsRef<str>>(languages: impl IntoIterator<Item = S>) -> Self {
		Self {
			catalog: catalogs().pick(languages),
		}
	}

	pub fn text(&self, text: NativeText) -> &'static str {
		catalogs().text(self.catalog, text)
	}

	pub fn fill(&self, text: NativeText, values: &[(&str, &str)]) -> String {
		fill(self.text(text), values)
	}
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;

	use super::*;

	const ALL: [NativeText; 13] = [
		NativeText::WebViewWarningTitle,
		NativeText::WebView2Description,
		NativeText::WebView2Update,
		NativeText::WebKitGtkDescription,
		NativeText::WebKitGtkUpdate,
		NativeText::PredecessorTitle,
		NativeText::PredecessorDescription,
		NativeText::PredecessorQuit,
		NativeText::LocationTitle,
		NativeText::LocationDescription,
		NativeText::LocationQuit,
		NativeText::GoogleSignInTitle,
		NativeText::FacebookSignInTitle,
	];

	const MANIFEST: &str =
		include_str!("../../../src/lib/i18n/desktop-strings.json");

	fn placeholders(text: &str) -> BTreeSet<&str> {
		text.split("{{")
			.skip(1)
			.filter_map(|rest| rest.split_once("}}").map(|(name, _)| name))
			.collect()
	}

	#[test]
	fn the_manifest_maps_exactly_the_texts_the_app_shows() {
		let manifest: BTreeMap<String, String> =
			serde_json::from_str(MANIFEST).unwrap();
		let names: BTreeSet<&str> =
			ALL.iter().map(|text| text.name()).collect();
		assert_eq!(
			manifest.keys().map(String::as_str).collect::<BTreeSet<_>>(),
			names,
			"desktop-strings.json and NativeText no longer name the same texts"
		);
	}

	#[test]
	fn english_has_every_text_with_the_placeholders_the_app_fills() {
		let english = &catalogs().texts[SOURCE_CATALOG];
		for text in ALL {
			let shown = english.get(text.name()).unwrap_or_else(|| {
				panic!("catalogs.json has no English {}", text.name())
			});
			let expected: BTreeSet<&str> = match text {
				NativeText::WebView2Description
				| NativeText::WebKitGtkDescription => ["minimumVersion", "version"].into(),
				NativeText::LocationDescription => ["folder"].into(),
				_ => BTreeSet::new(),
			};
			assert_eq!(placeholders(shown), expected, "{}", text.name());
		}
	}

	#[test]
	fn every_catalog_names_only_known_texts() {
		let names: BTreeSet<&str> =
			ALL.iter().map(|text| text.name()).collect();
		for (catalog, texts) in &catalogs().texts {
			for name in texts.keys() {
				assert!(names.contains(name.as_str()), "{catalog}: {name}");
			}
		}
	}

	#[test]
	fn the_first_language_a_catalog_matches_wins_and_english_ends_the_list() {
		let catalogs = Catalogs::parse(
			r#"{
				"matching": {
					"aliases": {},
					"likelySubtags": {"en": "en-Latn-US", "es": "es-Latn-ES"},
					"likelyScripts": {"de": "Latn", "en": "Latn", "es": "Latn"},
					"parents": {"es-MX": "es-419"}
				},
				"catalogs": {
					"de": {"location_quit": "Beenden"},
					"en": {"location_quit": "Quit", "location_title": "Move"},
					"es-419": {"location_quit": "Salir"}
				}
			}"#,
		)
		.unwrap();
		assert_eq!(catalogs.pick(["fr-FR", "es-MX", "de-AT"]), "es-419");
		assert_eq!(catalogs.pick(["de_AT.UTF-8"]), "de");
		assert_eq!(catalogs.pick(["fr-FR", "ja"]), "en");
		assert_eq!(catalogs.pick(Vec::<String>::new()), "en");
		assert_eq!(catalogs.text("de", NativeText::LocationQuit), "Beenden");
		assert_eq!(
			catalogs.text("de", NativeText::LocationTitle),
			"Move",
			"a text the catalog lacks falls back to English"
		);
	}

	#[test]
	fn a_language_without_a_catalog_shows_english() {
		assert_eq!(NativeStrings::pick(["xx-YY"]).catalog, SOURCE_CATALOG);
		assert_eq!(
			NativeStrings::pick(["en-US"]).text(NativeText::LocationQuit),
			"Quit"
		);
	}

	#[test]
	fn placeholders_take_their_values_by_name() {
		assert_eq!(
			fill(
				"Needs {{minimumVersion}} or newer (found {{version}}).",
				&[("version", "2.40"), ("minimumVersion", "2.42")]
			),
			"Needs 2.42 or newer (found 2.40)."
		);
		assert_eq!(
			fill("Run from {{folder}}.", &[("folder", "{{folder}}")]),
			"Run from {{folder}}.",
			"a value is never filled again"
		);
		assert_eq!(
			fill("{{missing}} and {{folder}}", &[("folder", "/Applications")]),
			"{{missing}} and /Applications"
		);
		assert_eq!(
			fill("No end {{folder", &[("folder", "x")]),
			"No end {{folder"
		);
		assert_eq!(fill("Ünïcödé {{a}}…", &[("a", "ß")]), "Ünïcödé ß…");
	}
}
