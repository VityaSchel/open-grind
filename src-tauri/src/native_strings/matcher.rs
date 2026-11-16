use std::collections::HashMap;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Matching {
	aliases: HashMap<String, String>,
	likely_subtags: HashMap<String, String>,
	likely_scripts: HashMap<String, Option<String>>,
	parents: HashMap<String, String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct Locale {
	language: String,
	script: Option<String>,
	region: Option<String>,
	variants: Vec<String>,
}

fn is_alphabetic(subtag: &str) -> bool {
	subtag.bytes().all(|byte| byte.is_ascii_alphabetic())
}

fn is_variant(subtag: &str) -> bool {
	subtag.bytes().all(|byte| byte.is_ascii_alphanumeric())
		&& (matches!(subtag.len(), 5..=8)
			|| (subtag.len() == 4 && subtag.as_bytes()[0].is_ascii_digit()))
}

fn title_case(subtag: &str) -> String {
	let lower = subtag.to_ascii_lowercase();
	let (first, rest) = lower.split_at(1);
	format!("{}{rest}", first.to_ascii_uppercase())
}

fn joined(subtags: [Option<&str>; 3]) -> String {
	subtags.into_iter().flatten().collect::<Vec<_>>().join("-")
}

impl Locale {
	fn parse(tag: &str) -> Option<Self> {
		let mut subtags = tag.split('-').peekable();
		let language = subtags.next()?;
		if !matches!(language.len(), 2..=3 | 5..=8) || !is_alphabetic(language)
		{
			return None;
		}
		let script = subtags
			.next_if(|subtag| subtag.len() == 4 && is_alphabetic(subtag))
			.map(title_case);
		let region = subtags
			.next_if(|subtag| {
				(subtag.len() == 2 && is_alphabetic(subtag))
					|| (subtag.len() == 3
						&& subtag.bytes().all(|byte| byte.is_ascii_digit()))
			})
			.map(str::to_ascii_uppercase);
		let mut variants = Vec::new();
		for subtag in subtags {
			if subtag.len() == 1 {
				break;
			}
			if !is_variant(subtag) {
				return None;
			}
			variants.push(subtag.to_ascii_lowercase());
		}
		Some(Self {
			language: language.to_ascii_lowercase(),
			script,
			region,
			variants,
		})
	}

	fn of_language(&self) -> Self {
		Self {
			language: self.language.clone(),
			..Self::default()
		}
	}

	fn base_name(&self) -> String {
		let mut name = joined([
			Some(&self.language),
			self.script.as_deref(),
			self.region.as_deref(),
		]);
		for variant in &self.variants {
			name.push('-');
			name.push_str(variant);
		}
		name
	}
}

impl Matching {
	fn normalize(&self, raw: &str) -> Option<Locale> {
		let (name, modifier) = match raw.split_once('@') {
			Some((name, modifier)) => (name, Some(modifier)),
			None => (raw, None),
		};
		let base = name.split('.').next().unwrap_or_default();
		let locale = Locale::parse(&base.replace('_', "-"))?;
		if matches!(locale.language.as_str(), "posix" | "und") {
			return None;
		}
		let alias = self.aliases.get(&locale.language);
		let latin = modifier
			.filter(|modifier| modifier.eq_ignore_ascii_case("latin"))
			.map(|_| "Latn".to_owned());
		if alias.is_none() && latin.is_none() {
			return Some(locale);
		}
		let target = Locale::parse(alias.unwrap_or(&locale.language))?;
		Some(Locale {
			language: target.language,
			script: locale.script.or(target.script).or(latin),
			region: locale.region,
			variants: Vec::new(),
		})
	}

	fn with_likely_subtags(
		&self,
		locale: &Locale,
	) -> (Option<String>, Option<String>) {
		let language = &locale.language;
		let likely = [
			locale
				.script
				.as_ref()
				.map(|script| format!("{language}-{script}")),
			locale
				.region
				.as_ref()
				.map(|region| format!("{language}-{region}")),
			Some(language.clone()),
		]
		.into_iter()
		.flatten()
		.find_map(|key| self.likely_subtags.get(&key))
		.and_then(|tag| Locale::parse(tag));
		match likely {
			Some(filled) => (
				locale.script.clone().or(filled.script),
				locale.region.clone().or(filled.region),
			),
			None => (locale.script.clone(), locale.region.clone()),
		}
	}

	fn locale_key(&self, locale: &Locale) -> Option<String> {
		let likely_script = self.likely_scripts.get(&locale.language)?;
		let (script, region) = self.with_likely_subtags(locale);
		let own_script =
			script.filter(|script| Some(script) != likely_script.as_ref());
		Some(joined([
			Some(&locale.language),
			own_script.as_deref(),
			region.as_deref(),
		]))
	}

	fn parent_of(&self, key: &str) -> Option<String> {
		if let Some(parent) = self.parents.get(key) {
			return Some(parent.clone());
		}
		let locale = Locale::parse(key)?;
		locale.region.as_ref()?;
		Some(joined([
			Some(&locale.language),
			locale.script.as_deref(),
			None,
		]))
	}

	fn lineage(&self, locale: &Locale) -> Vec<String> {
		let mut chain = Vec::new();
		let mut key = self.locale_key(locale);
		while let Some(current) = key {
			if chain.contains(&current) {
				break;
			}
			key = self.parent_of(&current);
			chain.push(current);
		}
		chain
	}
}

#[derive(Debug)]
struct Known {
	id: String,
	lineage: Vec<String>,
	default_content: bool,
}

#[derive(Debug)]
pub struct Matcher {
	matching: Matching,
	catalogs: Vec<Known>,
}

fn distance(wanted: &[String], own: &[String]) -> Option<usize> {
	wanted.iter().enumerate().find_map(|(index, key)| {
		own.iter()
			.position(|other| other == key)
			.map(|at| index + at)
	})
}

impl Matcher {
	pub fn new(
		matching: Matching,
		ids: impl IntoIterator<Item = String>,
	) -> Self {
		let mut ids: Vec<String> = ids.into_iter().collect();
		ids.sort();
		let catalogs = ids
			.into_iter()
			.filter_map(|id| {
				let locale = Locale::parse(&id)?;
				Some(Known {
					lineage: matching.lineage(&locale),
					default_content: matching.locale_key(&locale)
						== matching.locale_key(&locale.of_language()),
					id,
				})
			})
			.collect();
		Self { matching, catalogs }
	}

	pub fn catalog_for(&self, tag: &str) -> Option<&str> {
		let normalized = self.matching.normalize(tag)?;
		let name = normalized.base_name();
		if let Some(exact) = self.catalogs.iter().find(|known| known.id == name)
		{
			return Some(&exact.id);
		}
		let wanted = self.matching.lineage(&normalized);
		let mut best: Option<(&Known, usize)> = None;
		for known in &self.catalogs {
			let Some(distance) = distance(&wanted, &known.lineage) else {
				continue;
			};
			let closer = best.is_none_or(|(current, shortest)| {
				distance < shortest
					|| (distance == shortest
						&& known.default_content
						&& !current.default_content)
			});
			if closer {
				best = Some((known, distance));
			}
		}
		best.map(|(known, _)| known.id.as_str())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[derive(Deserialize)]
	struct Cases {
		catalogs: Vec<String>,
		matching: Matching,
		cases: Vec<(String, Option<String>)>,
	}

	fn cases() -> Cases {
		serde_json::from_str(include_str!("matcher-cases.json"))
			.expect("matcher-cases.json is not what bun run gen:i18n writes")
	}

	#[test]
	fn every_tag_reaches_the_catalog_the_app_picks() {
		let Cases {
			catalogs,
			matching,
			cases,
		} = cases();
		assert!(cases.len() > 50, "matcher-cases.json lists too few tags");
		let matcher = Matcher::new(matching, catalogs);
		let mismatches: Vec<_> = cases
			.iter()
			.filter(|(tag, catalog)| {
				matcher.catalog_for(tag) != catalog.as_deref()
			})
			.map(|(tag, catalog)| {
				format!(
					"{tag}: app {catalog:?}, native {:?}",
					matcher.catalog_for(tag)
				)
			})
			.collect();
		assert!(mismatches.is_empty(), "{mismatches:#?}");
	}

	#[test]
	fn tags_read_as_the_browser_writes_them() {
		let matching = cases().matching;
		for (raw, normalized) in [
			("EN_us", Some("en-US")),
			("de_AT.UTF-8", Some("de-AT")),
			("sr_RS@latin", Some("sr-Latn-RS")),
			("zh-hant-tw", Some("zh-Hant-TW")),
			("es-419", Some("es-419")),
			("en-US-u-ca-gregory", Some("en-US")),
			("ca-ES-VALENCIA", Some("ca-ES-valencia")),
			("tl-PH", Some("fil-PH")),
			("sh", Some("sr-Latn")),
			("C", None),
			("POSIX", None),
			("und-US", None),
			("abcd", None),
			("en--US", None),
		] {
			assert_eq!(
				matching
					.normalize(raw)
					.map(|locale| locale.base_name())
					.as_deref(),
				normalized,
				"{raw}"
			);
		}
	}
}
