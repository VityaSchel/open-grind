pub const STATUS_BAR_TAP_SCRIPT: &str = "window.__iosStatusBarTap?.()";

#[cfg(test)]
mod tests {
	use super::*;

	const APP_TYPES: &str = include_str!("../../../src/app.d.ts");
	const SCROLL_MOMENTUM: &str =
		include_str!("../../../src/lib/platform/scroll-momentum.ts");
	const STATUS_BAR_TAP: &str =
		include_str!("../../../src/lib/platform/status-bar-tap.ts");

	#[test]
	fn the_stop_reads_the_point_the_page_sends() {
		assert!(SCROLL_MOMENTUM
			.contains("invoke(\"stop_scroll_momentum\", { at })"));
	}

	#[test]
	fn a_status_bar_tap_calls_the_hook_the_page_installs() {
		assert_eq!(STATUS_BAR_TAP_SCRIPT, "window.__iosStatusBarTap?.()");
		assert!(APP_TYPES.contains("__iosStatusBarTap?: () => void;"));
		assert!(STATUS_BAR_TAP.contains("window.__iosStatusBarTap ="));
	}
}
