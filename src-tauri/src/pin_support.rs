use std::ops::Range;

pub const MANIFEST: &str =
	include_str!("../gen/android/app/src/main/AndroidManifest.xml");

pub const ADDON_GATE: &str = include_str!(
	"../android-logic/src/main/kotlin/org/opengrind/addon/AddonGate.kt"
);

const PLUGIN_REJECTION: &str = include_str!("plugin_rejection.rs");

pub fn squashed(source: &str) -> String {
	source.split_whitespace().collect()
}

pub fn is_identifier(character: char) -> bool {
	character.is_alphanumeric() || character == '_'
}

pub fn source_tokens(source: &str) -> Vec<&str> {
	let mut tokens = Vec::new();
	let mut word_start = None;
	for (at, character) in source.char_indices() {
		match (is_identifier(character), word_start) {
			(true, None) => word_start = Some(at),
			(false, Some(start)) => {
				tokens.push(&source[start..at]);
				word_start = None;
			}
			_ => {}
		}
		if !is_identifier(character) && !character.is_whitespace() {
			tokens.push(&source[at..at + character.len_utf8()]);
		}
	}
	if let Some(start) = word_start {
		tokens.push(&source[start..]);
	}
	tokens
}

pub fn spaced_match(source: &str, header: &str) -> Option<Range<usize>> {
	let tokens = source_tokens(header);
	let first = *tokens.first()?;
	source.match_indices(first).find_map(|(start, _)| {
		if first.starts_with(is_identifier)
			&& source[..start].ends_with(is_identifier)
		{
			return None;
		}
		let mut end = start;
		for token in &tokens {
			let rest = &source[end..];
			let token_start = end + rest.len() - rest.trim_start().len();
			if !source[token_start..].starts_with(token) {
				return None;
			}
			end = token_start + token.len();
			if token.starts_with(is_identifier)
				&& source[end..].starts_with(is_identifier)
			{
				return None;
			}
		}
		Some(start..end)
	})
}

pub fn braced_block<'a>(source: &'a str, file: &str, header: &str) -> &'a str {
	&source[braced_range(source, file, header)]
}

pub fn braced_range(source: &str, file: &str, header: &str) -> Range<usize> {
	let open = spaced_match(source, header)
		.and_then(|found| {
			source[found.end..].find('{').map(|brace| found.end + brace)
		})
		.unwrap_or_else(|| panic!("{file} no longer declares {header}"));
	let mut depth = 0;
	for (offset, character) in source[open..].char_indices() {
		match character {
			'{' => depth += 1,
			'}' => {
				depth -= 1;
				if depth == 0 {
					return open + 1..open + offset;
				}
			}
			_ => {}
		}
	}
	panic!("{file} {header} has no closing brace")
}

pub fn kotlin_constant<'a>(source: &'a str, file: &str, name: &str) -> &'a str {
	let start = spaced_match(source, &format!("const val {name} = \""))
		.unwrap_or_else(|| panic!("{file} no longer declares {name}"))
		.end;
	let length = source[start..]
		.find('"')
		.unwrap_or_else(|| panic!("{file} {name} is not a string literal"));
	&source[start..start + length]
}

pub fn kotlin_package<'a>(source: &'a str, file: &str) -> &'a str {
	source
		.lines()
		.find_map(|line| line.strip_prefix("package "))
		.unwrap_or_else(|| panic!("{file} declares no package"))
		.trim()
}

pub fn addon_gate_verdicts() -> Vec<&'static str> {
	braced_block(ADDON_GATE, "AddonGate.kt", "enum class Verdict")
		.split(',')
		.map(str::trim)
		.filter(|name| !name.is_empty())
		.collect()
}

pub fn assert_rejections_classify_as(
	bridge_file: &str,
	bridge: &str,
	error: &str,
) {
	let bridge = squashed(bridge);
	let mapped = bridge.matches(".map_err(").count();
	assert!(
		mapped > 0
			&& bridge
				.matches(&format!(
					".map_err(|error|classify(error,{error}::from_rejection))"
				))
				.count() == mapped,
		"{bridge_file} maps a plugin error without classifying its rejection marker as a {error}"
	);
	assert!(
		squashed(PLUGIN_REJECTION).contains(
			"InvokeRejected(response)=>{from_rejection(response.message.as_deref(),response.code.as_deref(),)}"
		),
		"plugin_rejection.rs classify no longer passes the rejection marker and its detail"
	);
}

#[test]
fn a_spaced_match_ignores_layout_but_not_names() {
	let source = "fun installPending(invoke: Invoke) {}\n\tfun install (\n\t\tinvoke : Invoke\n\t) {}";
	let found = spaced_match(source, "fun install(invoke: Invoke)")
		.expect("a reformatted declaration is still the declaration");
	assert!(source[found].starts_with("fun install ("));
	assert_eq!(spaced_match(source, "fun instal(invoke: Invoke)"), None);
	assert_eq!(
		spaced_match("funinstall(invoke: Invoke)", "fun install("),
		None
	);
	assert_eq!(
		spaced_match("class InstallArgsX", "class InstallArgs"),
		None
	);
	assert_eq!(
		spaced_match("internalclass InstallArgs", "class InstallArgs"),
		None
	);
}
