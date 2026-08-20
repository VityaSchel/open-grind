//! Tells the webview whether trackpad scrolling is finger-driven, coasting on
//! momentum, or over — the one bit DOM wheel events strip, and the ground
//! truth every scroll-gesture heuristic tried to reconstruct. Only phase
//! TRANSITIONS are emitted, a handful per gesture; legacy mouse wheels carry
//! no phases and so emit nothing. No-op off macOS.

use std::sync::atomic::{AtomicBool, Ordering};

/// While captured, the current gesture's remaining events are swallowed
/// before dispatch: the webview never sees them, so nothing scrolls and no
/// listener games are needed. The monitor drops the flag itself once the
/// gesture (momentum included) dies out.
static CAPTURE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn scroll_gesture_capture(capture: bool) {
	CAPTURE.store(capture, Ordering::Relaxed);
}

pub fn install_scroll_gesture_bridge<R: tauri::Runtime>(
	app: &tauri::AppHandle<R>,
) {
	#[cfg(target_os = "macos")]
	macos::install(app.clone());

	#[cfg(not(target_os = "macos"))]
	let _ = app;
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GestureState {
	Idle,
	Fingers,
	Momentum,
}

/// Collapses a scroll event's phase pair into the gesture state, and the
/// transition to announce. "released" rather than "idle" marks the instant
/// the fingers leave while the gesture may still coast.
#[cfg(any(target_os = "macos", test))]
pub fn classify(
	phase: u64,
	momentum: u64,
	previous: GestureState,
) -> (GestureState, Option<&'static str>) {
	const ACTIVE: u64 = 1 | 2 | 4 | 32; // began | stationary | changed | may-begin
	const OVER: u64 = 8 | 16; // ended | cancelled

	let next = if phase & ACTIVE != 0 {
		GestureState::Fingers
	} else if phase & OVER != 0 {
		GestureState::Idle
	} else if momentum & (1 | 4) != 0 {
		GestureState::Momentum
	} else {
		GestureState::Idle
	};

	let announce = if previous == GestureState::Fingers && phase & OVER != 0 {
		Some("released")
	} else if next != previous {
		Some(match next {
			GestureState::Fingers => "fingers",
			GestureState::Momentum => "momentum",
			GestureState::Idle => "idle",
		})
	} else {
		None
	};

	(next, announce)
}

#[cfg(target_os = "macos")]
mod macos {
	use std::cell::{Cell, RefCell};
	use std::ptr::NonNull;

	use block2::RcBlock;
	use objc2::rc::Retained;
	use objc2::runtime::AnyObject;
	use objc2_app_kit::{NSEvent, NSEventMask};
	use serde::Serialize;
	use tauri::Emitter;

	use super::{classify, GestureState};

	#[derive(Debug, Clone, Serialize)]
	#[serde(rename_all = "camelCase")]
	struct ScrollGesture {
		#[serde(skip_serializing_if = "Option::is_none")]
		state: Option<&'static str>,
		// AppKit's scrollingDelta is what a native scroller would consume;
		// the webview's DOM deltas run noticeably hotter, so anything meant
		// to move at natural scroll speed must use these.
		#[serde(skip_serializing_if = "Option::is_none")]
		dx: Option<f64>,
		#[serde(skip_serializing_if = "Option::is_none")]
		dy: Option<f64>,
	}

	thread_local! {
		static MONITOR: RefCell<Option<Retained<AnyObject>>> =
			const { RefCell::new(None) };
		static STATE: Cell<GestureState> = const { Cell::new(GestureState::Idle) };
	}

	// The monitor observes only this process's own event stream, so no TCC
	// permission is involved; AppKit invokes the handler on the main thread.
	pub fn install<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
		let handler =
			RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
				let e = unsafe { event.as_ref() };
				let (next, announce) = STATE.with(|state| {
					let pair = classify(
						e.phase().0 as u64,
						e.momentumPhase().0 as u64,
						state.get(),
					);
					state.set(pair.0);
					pair
				});
				let fingers = next == GestureState::Fingers;
				if announce.is_some() || fingers {
					app.emit(
						"scroll:gesture",
						ScrollGesture {
							state: announce,
							dx: fingers.then(|| e.scrollingDeltaX()),
							dy: fingers.then(|| e.scrollingDeltaY()),
						},
					)
					.ok();
				}
				if next == super::GestureState::Idle {
					super::CAPTURE
						.store(false, std::sync::atomic::Ordering::Relaxed);
					event.as_ptr()
				} else if super::CAPTURE
					.load(std::sync::atomic::Ordering::Relaxed)
				{
					std::ptr::null_mut()
				} else {
					event.as_ptr()
				}
			});

		let monitor = unsafe {
			NSEvent::addLocalMonitorForEventsMatchingMask_handler(
				NSEventMask::ScrollWheel,
				&handler,
			)
		};
		MONITOR.with(|slot| *slot.borrow_mut() = monitor);
	}
}

#[cfg(test)]
mod tests {
	use super::{classify, GestureState};

	const BEGAN: u64 = 1;
	const CHANGED: u64 = 4;
	const ENDED: u64 = 8;
	const NONE: u64 = 0;

	#[test]
	fn a_finger_gesture_announces_each_transition_once() {
		let (state, announce) = classify(BEGAN, NONE, GestureState::Idle);
		assert_eq!(state, GestureState::Fingers);
		assert_eq!(announce, Some("fingers"));

		let (state, announce) = classify(CHANGED, NONE, state);
		assert_eq!(state, GestureState::Fingers);
		assert_eq!(announce, None);

		let (state, announce) = classify(ENDED, NONE, state);
		assert_eq!(state, GestureState::Idle);
		assert_eq!(announce, Some("released"));
	}

	#[test]
	fn a_momentum_tail_is_bracketed_by_momentum_and_idle() {
		let (state, announce) = classify(NONE, BEGAN, GestureState::Idle);
		assert_eq!(state, GestureState::Momentum);
		assert_eq!(announce, Some("momentum"));

		let (state, announce) = classify(NONE, CHANGED, state);
		assert_eq!(announce, None);

		let (state, announce) = classify(NONE, ENDED, state);
		assert_eq!(state, GestureState::Idle);
		assert_eq!(announce, Some("idle"));
	}

	#[test]
	fn a_mouse_wheel_with_no_phases_announces_nothing() {
		let (state, announce) = classify(NONE, NONE, GestureState::Idle);
		assert_eq!(state, GestureState::Idle);
		assert_eq!(announce, None);
	}

	#[test]
	fn a_lift_straight_into_momentum_still_reports_the_release() {
		let (state, announce) = classify(CHANGED, NONE, GestureState::Idle);
		assert_eq!(state, GestureState::Fingers);
		assert_eq!(announce, Some("fingers"));

		let (state, announce) = classify(ENDED, NONE, state);
		assert_eq!(announce, Some("released"));

		let (_, announce) = classify(NONE, BEGAN, state);
		assert_eq!(announce, Some("momentum"));
	}
}
