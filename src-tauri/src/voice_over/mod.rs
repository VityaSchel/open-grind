#[cfg(target_os = "ios")]
pub mod ios;

pub fn status_script(running: bool) -> String {
	format!("window.__iosVoiceOver?.({running})")
}

#[cfg(test)]
mod tests {
	use super::*;

	const APP_TYPES: &str = include_str!("../../../src/app.d.ts");
	const VOICE_OVER: &str =
		include_str!("../../../src/lib/platform/voice-over.svelte.ts");

	#[test]
	fn the_status_is_a_bare_boolean_for_the_hook_the_page_installs() {
		assert_eq!(status_script(true), "window.__iosVoiceOver?.(true)");
		assert_eq!(status_script(false), "window.__iosVoiceOver?.(false)");
		assert!(
			APP_TYPES.contains("__iosVoiceOver?: (running: boolean) => void;")
		);
		assert!(VOICE_OVER.contains("window.__iosVoiceOver ="));
	}

	#[test]
	fn the_page_reads_the_starting_status_from_the_command() {
		assert!(VOICE_OVER.contains("invoke<boolean>(\"voice_over_running\")"));
	}
}
