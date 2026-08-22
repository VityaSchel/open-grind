#[cfg(debug_assertions)]
const ORIGIN_VAR: &str = "OPEN_GRIND_UPDATE_ORIGIN";
#[cfg(debug_assertions)]
const KEY_VAR: &str = "OPEN_GRIND_UPDATE_KEY";

#[cfg(debug_assertions)]
const ANDROID_OVERRIDE_FILE: &str = "/data/local/tmp/open-grind-update.env";

#[cfg(debug_assertions)]
fn assigned(contents: &str, name: &str) -> Option<String> {
	contents.lines().find_map(|line| {
		let value = line.trim().strip_prefix(name)?.strip_prefix('=')?;
		Some(value.trim().to_owned())
	})
}

#[cfg(debug_assertions)]
fn configured(name: &str) -> Option<String> {
	if let Ok(value) = std::env::var(name) {
		return Some(value);
	}
	assigned(&std::fs::read_to_string(ANDROID_OVERRIDE_FILE).ok()?, name)
}

#[cfg(debug_assertions)]
pub fn origin() -> Option<String> {
	configured(ORIGIN_VAR).filter(|origin| origin.ends_with('/'))
}

#[cfg(not(debug_assertions))]
pub fn origin() -> Option<String> {
	None
}

#[cfg(debug_assertions)]
pub fn release_key() -> Option<[u8; 32]> {
	super::verify::minisign_public_key(&configured(KEY_VAR)?)
}

#[cfg(not(debug_assertions))]
pub fn release_key() -> Option<[u8; 32]> {
	None
}

#[cfg(test)]
mod tests {
	use super::*;

	#[cfg(debug_assertions)]
	#[test]
	fn an_override_file_assigns_by_name() {
		let contents = "OPEN_GRIND_UPDATE_ORIGIN=http://127.0.0.1:8787/\nOPEN_GRIND_UPDATE_KEY=RW123\n";

		assert_eq!(
			assigned(contents, ORIGIN_VAR).as_deref(),
			Some("http://127.0.0.1:8787/")
		);
		assert_eq!(assigned(contents, KEY_VAR).as_deref(), Some("RW123"));
		assert_eq!(assigned(contents, "OPEN_GRIND_MISSING"), None);
	}

	#[cfg(debug_assertions)]
	#[test]
	fn a_prefix_of_another_name_is_not_a_match() {
		assert_eq!(
			assigned("OPEN_GRIND_UPDATE_ORIGIN_EXTRA=x", ORIGIN_VAR),
			None
		);
	}
}
