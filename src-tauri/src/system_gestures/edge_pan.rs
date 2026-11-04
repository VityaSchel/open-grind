use serde::Serialize;

const COMMIT_PAST: f64 = 0.5;
const RELEASE_PROJECTION_SECONDS: f64 = 0.25;
const PREPARE_ZONE_POINTS: f64 = 40.0;
pub const PREPARE_SCRIPT: &str = "window.__iosBack?.prepare()";

const YIELDING_RECOGNIZERS: [&str; 4] = [
	"WKHighlightLongPressGestureRecognizer",
	"_UIDragLiftGestureRecognizer",
	"WKImageAnalysisGestureRecognizer",
	"UIVariableDelayLoupeGesture",
];

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct EdgePoint {
	pub x: f64,
	pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Release {
	pub commit: bool,
	pub velocity: f64,
}

impl Release {
	pub const CANCELLED: Self = Self {
		commit: false,
		velocity: 0.0,
	};

	pub fn at(progress: f64, velocity: f64) -> Self {
		Self {
			commit: commits(progress, velocity),
			velocity,
		}
	}
}

pub fn progress(translation: f64, width: f64) -> f64 {
	translation.max(0.0) / width.max(1.0)
}

pub fn prepares_for(x: f64) -> bool {
	x < PREPARE_ZONE_POINTS
}

pub fn commits(progress: f64, velocity: f64) -> bool {
	progress + RELEASE_PROJECTION_SECONDS * velocity > COMMIT_PAST
}

pub fn yields_to_back_swipe(class_name: &str) -> bool {
	YIELDING_RECOGNIZERS
		.iter()
		.any(|name| class_name.ends_with(name))
}

pub fn start_script(point: EdgePoint) -> String {
	let point =
		serde_json::to_string(&point).expect("plain numbers always serialize");
	format!("window.__iosBack?.start({point}) === true")
}

pub fn progress_script(progress: f64) -> String {
	format!("window.__iosBack?.progress({progress})")
}

pub fn finish_script(release: Release) -> String {
	let release = serde_json::to_string(&release)
		.expect("plain numbers always serialize");
	format!("window.__iosBack?.finish({release})")
}

#[cfg(test)]
mod tests {
	use super::*;

	const APP_TYPES: &str = include_str!("../../../src/app.d.ts");
	const IOS_BRIDGE: &str =
		include_str!("../../../src/lib/platform/ios-native-bridge.ts");

	fn declared_back_hooks() -> &'static str {
		APP_TYPES
			.split_once("__iosBack?: {")
			.and_then(|(_, rest)| rest.split_once("\n\t\t};"))
			.expect("app.d.ts declares window.__iosBack")
			.0
	}

	#[test]
	fn a_slow_release_commits_only_past_half_the_width() {
		assert!(!commits(0.48, 0.0));
		assert!(commits(0.52, 0.0));
	}

	#[test]
	fn a_fling_commits_from_under_half_the_width() {
		assert!(commits(0.3, 1.0));
	}

	#[test]
	fn a_fast_reversal_cancels_past_half_the_width() {
		assert!(!commits(0.68, -0.75));
	}

	#[test]
	fn progress_is_the_rightward_travel_in_widths() {
		assert_eq!(progress(201.0, 402.0), 0.5);
		assert_eq!(progress(-12.0, 402.0), 0.0);
		assert!(progress(5.0, 0.0).is_finite());
	}

	#[test]
	fn a_touch_landing_near_the_left_edge_prepares_the_stack() {
		assert!(prepares_for(2.0));
		assert!(prepares_for(39.5));
		assert!(!prepares_for(40.0));
		assert!(!prepares_for(120.0));
	}

	#[test]
	fn the_release_carries_its_commit_and_velocity() {
		assert_eq!(
			Release::at(0.3, 1.0),
			Release {
				commit: true,
				velocity: 1.0
			}
		);
		assert_eq!(
			Release::CANCELLED,
			Release {
				commit: false,
				velocity: 0.0
			}
		);
	}

	#[test]
	fn webkit_press_and_lift_recognizers_wait_for_the_back_swipe() {
		for name in YIELDING_RECOGNIZERS {
			assert!(yields_to_back_swipe(name), "{name}");
		}
		assert!(yields_to_back_swipe(
			"NSKVONotifying_WKHighlightLongPressGestureRecognizer"
		));
		for name in [
			"UIScrollViewPanGestureRecognizer",
			"WKTouchEventsGestureRecognizer",
			"UIScreenEdgePanGestureRecognizer",
		] {
			assert!(!yields_to_back_swipe(name), "{name}");
		}
	}

	#[test]
	fn the_start_hands_the_page_the_point_and_reads_back_a_boolean() {
		assert_eq!(
			start_script(EdgePoint { x: 2.0, y: 451.5 }),
			r#"window.__iosBack?.start({"x":2.0,"y":451.5}) === true"#
		);
		assert!(declared_back_hooks()
			.contains("start(point: { x: number; y: number }): boolean;"));
	}

	#[test]
	fn the_progress_is_a_bare_fraction_of_the_width() {
		assert_eq!(progress_script(0.25), "window.__iosBack?.progress(0.25)");
		assert!(
			declared_back_hooks().contains("progress(progress: number): void;")
		);
	}

	#[test]
	fn the_finish_fields_are_the_ones_the_page_reads() {
		let script = finish_script(Release::at(0.7, 1.5));
		let json = script
			.strip_prefix("window.__iosBack?.finish(")
			.and_then(|rest| rest.strip_suffix(')'))
			.expect(&script);
		assert_eq!(
			serde_json::from_str::<serde_json::Value>(json).unwrap(),
			serde_json::json!({ "commit": true, "velocity": 1.5 })
		);
		assert!(declared_back_hooks().contains(
			"finish(release: { commit: boolean; velocity: number }): void;"
		));
	}

	#[test]
	fn the_prepare_hook_is_declared() {
		assert_eq!(PREPARE_SCRIPT, "window.__iosBack?.prepare()");
		assert!(declared_back_hooks().contains("prepare(): void;"));
	}

	#[test]
	fn the_page_installs_every_hook_native_calls() {
		let installed = IOS_BRIDGE
			.split_once("window.__iosBack = {")
			.and_then(|(_, rest)| rest.split_once("\n\t\t};"))
			.expect("ios-native-bridge.ts installs window.__iosBack")
			.0;
		for hook in ["start:", "progress:", "finish:", "prepare:"] {
			assert!(installed.contains(hook), "{hook}");
		}
		assert!(IOS_BRIDGE.contains("invoke(\"set_back_swipe_armed\", {"));
	}
}
