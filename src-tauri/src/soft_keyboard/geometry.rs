use serde::{Deserialize, Serialize};

const DOCKED_TOLERANCE: f64 = 0.5;
const EASE_IN_OUT: [f64; 4] = [0.42, 0.0, 0.58, 1.0];
const EASE_IN: [f64; 4] = [0.42, 0.0, 1.0, 1.0];
const EASE_OUT: [f64; 4] = [0.0, 0.0, 0.58, 1.0];
const LINEAR: [f64; 4] = [0.0, 0.0, 1.0, 1.0];
const KEYBOARD: [f64; 4] = [0.296, 0.93, 0.287, 1.0];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
	pub x: f64,
	pub y: f64,
	pub width: f64,
	pub height: f64,
}

impl Rect {
	fn max_y(&self) -> f64 {
		self.y + self.height
	}

	fn is_empty(&self) -> bool {
		self.width <= 0.0 || self.height <= 0.0
	}
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Edges {
	pub top: f64,
	pub bottom: f64,
	pub left: f64,
	pub right: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct NativeInsets {
	pub top: f64,
	pub bottom: f64,
	pub left: f64,
	pub right: f64,
	pub ime: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardMotion {
	pub from: f64,
	pub to: f64,
	pub duration: f64,
	pub started_at: f64,
	pub curve: [f64; 4],
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct PagePoint {
	pub x: f64,
	pub y: f64,
}

pub fn keyboard_overlap(bounds: Rect, keyboard: Rect) -> f64 {
	let undocked = (keyboard.max_y() - bounds.max_y()).abs() > DOCKED_TOLERANCE;
	if keyboard.is_empty() || keyboard.y >= bounds.max_y() || undocked {
		return 0.0;
	}
	(bounds.max_y() - keyboard.y).clamp(0.0, bounds.height)
}

pub fn insets(safe: Edges, overlap: f64) -> NativeInsets {
	NativeInsets {
		top: safe.top,
		bottom: (safe.bottom - overlap).max(0.0),
		left: safe.left,
		right: safe.right,
		ime: overlap > 0.0,
	}
}

pub fn followed_insets(safe: Edges, overlap: f64) -> NativeInsets {
	NativeInsets {
		ime: overlap > 0.0,
		..insets(safe, 0.0)
	}
}

pub fn push_script(insets: &NativeInsets) -> String {
	let insets =
		serde_json::to_string(insets).expect("plain numbers always serialize");
	format!(
		"window.__iosInsets={insets};window.__reapplyInsets?.(window.__iosInsets)"
	)
}

pub fn timing_curve(curve: usize) -> [f64; 4] {
	match curve {
		0 => EASE_IN_OUT,
		1 => EASE_IN,
		2 => EASE_OUT,
		3 => LINEAR,
		_ => KEYBOARD,
	}
}

pub fn motion_script(motion: &KeyboardMotion) -> String {
	let motion =
		serde_json::to_string(motion).expect("plain numbers always serialize");
	format!("window.__iosKeyboardMotion?.({motion})")
}

#[cfg(test)]
mod tests {
	use super::*;

	const NATIVE_INSETS: &str =
		include_str!("../../../src/lib/platform/native-insets.ts");
	const SAFE_AREA: &str = include_str!("../../../src/lib/util/safe-area.ts");
	const KEYBOARD_FOLLOW: &str =
		include_str!("../../../src/lib/platform/keyboard-follow.ts");
	const KEYBOARD_DRAG_DISMISS: &str =
		include_str!("../../../src/lib/platform/keyboard-drag-dismiss.ts");
	const UNCOVERED_CENTER: &str =
		include_str!("../../../src/lib/util/uncovered-center.ts");

	const PORTRAIT: Rect = Rect {
		x: 0.0,
		y: 0.0,
		width: 402.0,
		height: 874.0,
	};
	const LANDSCAPE: Rect = Rect {
		x: 0.0,
		y: 0.0,
		width: 874.0,
		height: 402.0,
	};
	const PORTRAIT_KEYBOARD: Rect = Rect {
		x: 0.0,
		y: 546.0,
		width: 402.0,
		height: 328.0,
	};
	const SAFE: Edges = Edges {
		top: 62.0,
		bottom: 34.0,
		left: 0.0,
		right: 0.0,
	};

	fn pushed_json(script: &str) -> serde_json::Value {
		let json = script
			.strip_prefix("window.__iosInsets=")
			.and_then(|rest| {
				rest.strip_suffix(
					";window.__reapplyInsets?.(window.__iosInsets)",
				)
			})
			.expect(script);
		serde_json::from_str(json).unwrap()
	}

	#[test]
	fn a_docked_keyboard_covers_from_its_top_to_the_view_bottom() {
		assert_eq!(keyboard_overlap(PORTRAIT, PORTRAIT_KEYBOARD), 328.0);
	}

	#[test]
	fn a_keyboard_rect_from_the_other_orientation_covers_nothing() {
		assert_eq!(keyboard_overlap(LANDSCAPE, PORTRAIT_KEYBOARD), 0.0);
	}

	#[test]
	fn a_keyboard_below_the_view_covers_nothing() {
		let hidden = Rect {
			y: PORTRAIT.height,
			..PORTRAIT_KEYBOARD
		};
		assert_eq!(keyboard_overlap(PORTRAIT, hidden), 0.0);
	}

	#[test]
	fn a_floating_keyboard_covers_nothing() {
		let floating = Rect {
			x: 50.0,
			y: 400.0,
			width: 300.0,
			height: 250.0,
		};
		assert_eq!(keyboard_overlap(PORTRAIT, floating), 0.0);
	}

	#[test]
	fn an_empty_keyboard_rect_covers_nothing() {
		let empty = Rect {
			height: 0.0,
			y: PORTRAIT.height,
			..PORTRAIT_KEYBOARD
		};
		assert_eq!(keyboard_overlap(PORTRAIT, empty), 0.0);
	}

	#[test]
	fn the_overlap_never_exceeds_the_view_height() {
		let taller = Rect {
			y: -100.0,
			height: PORTRAIT.height + 100.0,
			..PORTRAIT_KEYBOARD
		};
		assert_eq!(keyboard_overlap(PORTRAIT, taller), PORTRAIT.height);
	}

	#[test]
	fn the_bottom_inset_is_zero_under_the_keyboard() {
		assert_eq!(
			insets(SAFE, 328.0),
			NativeInsets {
				top: 62.0,
				bottom: 0.0,
				left: 0.0,
				right: 0.0,
				ime: true,
			}
		);
		assert_eq!(insets(SAFE, 20.0).bottom, 14.0);
		assert_eq!(
			insets(SAFE, 0.0),
			NativeInsets {
				top: 62.0,
				bottom: 34.0,
				left: 0.0,
				right: 0.0,
				ime: false,
			}
		);
	}

	#[test]
	fn a_followed_keyboard_keeps_the_bottom_inset_and_reports_itself() {
		assert_eq!(
			followed_insets(SAFE, 328.0),
			NativeInsets {
				top: 62.0,
				bottom: 34.0,
				left: 0.0,
				right: 0.0,
				ime: true,
			}
		);
		assert_eq!(followed_insets(SAFE, 0.0), insets(SAFE, 0.0));
	}

	#[test]
	fn the_push_sets_ios_insets_before_reapplying_them() {
		let pushed = insets(SAFE, 328.0);
		assert_eq!(
			pushed_json(&push_script(&pushed)),
			serde_json::to_value(pushed).unwrap()
		);
		assert!(NATIVE_INSETS.contains("return window.__iosInsets;"));
		assert!(NATIVE_INSETS.contains("window.__reapplyInsets = "));
	}

	#[test]
	fn the_pushed_fields_are_the_ones_the_page_reads() {
		let declared = SAFE_AREA
			.split_once("SAFE_AREA_SIDES = [")
			.and_then(|(_, rest)| rest.split_once(']'))
			.expect("safe-area.ts lists SAFE_AREA_SIDES")
			.0;
		let mut read: Vec<&str> = declared
			.split(',')
			.map(|side| side.trim().trim_matches('"'))
			.filter(|side| !side.is_empty())
			.collect();
		assert!(NATIVE_INSETS.contains("& { ime: boolean }"));
		read.push("ime");
		read.sort_unstable();

		let pushed = pushed_json(&push_script(&insets(SAFE, 0.0)));
		let mut fields: Vec<&str> = pushed
			.as_object()
			.unwrap()
			.keys()
			.map(String::as_str)
			.collect();
		fields.sort_unstable();
		assert_eq!(fields, read);
	}

	#[test]
	fn the_motion_fields_are_the_ones_the_follower_reads() {
		let declared = KEYBOARD_FOLLOW
			.split_once("export type KeyboardMotion = {")
			.and_then(|(_, rest)| rest.split_once("};"))
			.expect("keyboard-follow.ts declares KeyboardMotion")
			.0;
		let mut read: Vec<&str> = declared
			.lines()
			.filter_map(|line| line.trim().split_once(':'))
			.map(|(field, _)| field)
			.collect();
		read.sort_unstable();
		let motion = serde_json::to_value(KeyboardMotion {
			from: 0.0,
			to: 0.0,
			duration: 0.0,
			started_at: 0.0,
			curve: timing_curve(7),
		})
		.unwrap();
		let mut fields: Vec<&str> = motion
			.as_object()
			.unwrap()
			.keys()
			.map(String::as_str)
			.collect();
		fields.sort_unstable();
		assert_eq!(fields, read);
		assert!(KEYBOARD_FOLLOW.contains("window.__iosKeyboardMotion = "));
	}

	#[test]
	fn the_drag_target_is_the_point_the_page_sends() {
		assert!(UNCOVERED_CENTER
			.contains("export type PagePoint = { x: number; y: number };"));
		assert!(KEYBOARD_DRAG_DISMISS
			.contains("function letDragDismiss(target: PagePoint | null)"));
		assert!(KEYBOARD_DRAG_DISMISS
			.contains("invoke(\"set_keyboard_drag_dismiss\", { target })"));
		assert_eq!(
			serde_json::from_str::<Option<PagePoint>>(r#"{"x":201,"y":451}"#)
				.unwrap(),
			Some(PagePoint { x: 201.0, y: 451.0 })
		);
		assert_eq!(
			serde_json::from_str::<Option<PagePoint>>("null").unwrap(),
			None
		);
	}

	#[test]
	fn the_keyboard_rides_its_measured_curve() {
		assert_eq!(timing_curve(7), [0.296, 0.93, 0.287, 1.0]);
	}

	#[test]
	fn the_standard_curves_are_core_animations() {
		assert_eq!(timing_curve(0), [0.42, 0.0, 0.58, 1.0]);
		assert_eq!(timing_curve(1), [0.42, 0.0, 1.0, 1.0]);
		assert_eq!(timing_curve(2), [0.0, 0.0, 0.58, 1.0]);
		assert_eq!(timing_curve(3), [0.0, 0.0, 1.0, 1.0]);
	}

	#[test]
	fn the_motion_reaches_the_page_in_milliseconds_and_camel_case() {
		let script = motion_script(&KeyboardMotion {
			from: 0.0,
			to: 328.0,
			duration: 383.3,
			started_at: 1_800_000_000_020.0,
			curve: timing_curve(7),
		});
		let json = script
			.strip_prefix("window.__iosKeyboardMotion?.(")
			.and_then(|rest| rest.strip_suffix(')'))
			.expect(&script);
		assert_eq!(
			serde_json::from_str::<serde_json::Value>(json).unwrap(),
			serde_json::json!({
				"from": 0.0,
				"to": 328.0,
				"duration": 383.3,
				"startedAt": 1_800_000_000_020.0,
				"curve": [0.296, 0.93, 0.287, 1.0],
			})
		);
	}
}
