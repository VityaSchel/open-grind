use serde::{Deserialize, Serialize};

use crate::page_point::PagePoint;

const COMMIT_PAST: f64 = 0.5;
const RELEASE_PROJECTION_SECONDS: f64 = 0.25;
const EDGE_ZONE_POINTS: f64 = 40.0;
const SIDEWAYS_SLACK_POINTS: f64 = 1.0;
pub const PREPARE_SCRIPT: &str = "window.__iosBack?.prepare()";

const YIELDING_RECOGNIZERS: [&str; 4] = [
	"WKHighlightLongPressGestureRecognizer",
	"_UIDragLiftGestureRecognizer",
	"WKImageAnalysisGestureRecognizer",
	"UIVariableDelayLoupeGesture",
];

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EdgeZone {
	#[default]
	Shared,
	GoesBack,
}

#[derive(Debug, Clone, Copy)]
pub struct Arming {
	pub armed: bool,
	pub edge_zone: EdgeZone,
	pub order: u64,
}

#[derive(Debug, Default)]
pub struct ArmState {
	order: u64,
	edge_zone: EdgeZone,
}

impl ArmState {
	pub fn edge_zone(&self) -> EdgeZone {
		self.edge_zone
	}

	pub fn apply(&mut self, arming: Arming) -> Option<bool> {
		if arming.order <= self.order {
			return None;
		}
		*self = Self {
			order: arming.order,
			edge_zone: arming.edge_zone,
		};
		Some(arming.armed)
	}

	pub fn reset(&mut self) {
		*self = Self::default();
	}
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScrollerExtent {
	pub content_width: f64,
	pub inset_left: f64,
	pub inset_right: f64,
	pub visible_width: f64,
}

impl ScrollerExtent {
	pub fn scrolls_sideways(self) -> bool {
		self.content_width + self.inset_left + self.inset_right
			> self.visible_width + SIDEWAYS_SLACK_POINTS
	}
}

#[derive(Debug, Clone, Copy)]
pub struct ScrollerTouch {
	pub zone: EdgeZone,
	pub landed_in_edge_zone: bool,
	pub scrolls_sideways: bool,
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

pub fn lands_in_edge_zone(x: f64) -> bool {
	x < EDGE_ZONE_POINTS
}

pub fn scroller_waits_for_back_swipe(touch: ScrollerTouch) -> bool {
	match touch.zone {
		EdgeZone::Shared => false,
		EdgeZone::GoesBack => {
			touch.landed_in_edge_zone && touch.scrolls_sideways
		}
	}
}

fn commits(progress: f64, velocity: f64) -> bool {
	progress + RELEASE_PROJECTION_SECONDS * velocity > COMMIT_PAST
}

pub fn yields_to_back_swipe(class_name: &str) -> bool {
	YIELDING_RECOGNIZERS
		.iter()
		.any(|name| class_name.ends_with(name))
}

pub fn start_script(point: PagePoint) -> String {
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
	const IOS_SYSTEM_BACK: &str =
		include_str!("../../../src/lib/platform/ios-system-back.ts");
	const SYSTEM_BACK_GESTURE: &str =
		include_str!("../../../src/lib/platform/system-back-gesture.svelte.ts");

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
	fn a_touch_landing_near_the_left_edge_lands_in_the_edge_zone() {
		assert!(lands_in_edge_zone(2.0));
		assert!(lands_in_edge_zone(39.5));
		assert!(!lands_in_edge_zone(40.0));
		assert!(!lands_in_edge_zone(120.0));
	}

	const PAGER_AT_THE_EDGE: ScrollerTouch = ScrollerTouch {
		zone: EdgeZone::GoesBack,
		landed_in_edge_zone: true,
		scrolls_sideways: true,
	};

	#[test]
	fn a_pager_waits_for_the_back_swipe_only_at_an_edge_that_goes_back() {
		assert!(scroller_waits_for_back_swipe(PAGER_AT_THE_EDGE));
		for touch in [
			ScrollerTouch {
				landed_in_edge_zone: false,
				..PAGER_AT_THE_EDGE
			},
			ScrollerTouch {
				zone: EdgeZone::Shared,
				..PAGER_AT_THE_EDGE
			},
			ScrollerTouch {
				scrolls_sideways: false,
				..PAGER_AT_THE_EDGE
			},
		] {
			assert!(!scroller_waits_for_back_swipe(touch), "{touch:?}");
		}
	}

	const GOES_BACK_ARMED: Arming = Arming {
		armed: true,
		edge_zone: EdgeZone::GoesBack,
		order: 2,
	};

	#[test]
	fn a_stale_arming_leaves_the_edge_zone_alone() {
		let mut state = ArmState::default();
		assert_eq!(state.apply(GOES_BACK_ARMED), Some(true));
		for order in [1, 2] {
			assert_eq!(
				state.apply(Arming {
					armed: false,
					edge_zone: EdgeZone::Shared,
					order,
				}),
				None,
				"{order}"
			);
		}
		assert_eq!(state.edge_zone(), EdgeZone::GoesBack);
	}

	#[test]
	fn a_newer_arming_replaces_the_edge_zone() {
		let mut state = ArmState::default();
		state.apply(GOES_BACK_ARMED);
		assert_eq!(
			state.apply(Arming {
				armed: false,
				edge_zone: EdgeZone::Shared,
				order: 3,
			}),
			Some(false)
		);
		assert_eq!(state.edge_zone(), EdgeZone::Shared);
	}

	#[test]
	fn a_reset_shares_the_edge_and_takes_the_first_order_again() {
		let mut state = ArmState::default();
		assert_eq!(state.edge_zone(), EdgeZone::Shared);
		state.apply(GOES_BACK_ARMED);
		state.reset();
		assert_eq!(state.edge_zone(), EdgeZone::Shared);
		assert_eq!(
			state.apply(Arming {
				order: 1,
				..GOES_BACK_ARMED
			}),
			Some(true)
		);
		assert_eq!(state.edge_zone(), EdgeZone::GoesBack);
	}

	#[test]
	fn a_scroller_scrolls_sideways_only_past_a_point_of_overflow() {
		let pager = ScrollerExtent {
			content_width: 1206.0,
			inset_left: 0.0,
			inset_right: 0.0,
			visible_width: 402.0,
		};
		assert!(pager.scrolls_sideways());
		assert!(!ScrollerExtent {
			content_width: 402.5,
			..pager
		}
		.scrolls_sideways());
		assert!(ScrollerExtent {
			content_width: 402.0,
			inset_left: 16.0,
			..pager
		}
		.scrolls_sideways());
	}

	#[test]
	fn the_edge_zone_reads_the_names_the_page_sends() {
		for (sent, zone) in [
			("shared", EdgeZone::Shared),
			("goes-back", EdgeZone::GoesBack),
		] {
			assert_eq!(
				serde_json::from_value::<EdgeZone>(serde_json::json!(sent))
					.unwrap(),
				zone
			);
		}
		assert!(SYSTEM_BACK_GESTURE
			.contains(r#"export type EdgeZone = "shared" | "goes-back";"#));
		assert!(IOS_SYSTEM_BACK.contains(
			r#"invoke("set_back_swipe_armed", { armed, edgeZone, order })"#
		));
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
			start_script(PagePoint { x: 2.0, y: 451.5 }),
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
		let installed = IOS_SYSTEM_BACK
			.split_once("window.__iosBack = {")
			.and_then(|(_, rest)| rest.split_once("\n\t\t};"))
			.expect("ios-system-back.ts installs window.__iosBack")
			.0;
		for hook in ["start:", "progress:", "finish:", "prepare:"] {
			assert!(installed.contains(hook), "{hook}");
		}
	}
}
