//! Tells the webview whether trackpad scrolling is finger-driven, coasting on
//! momentum, or over — the one bit DOM wheel events strip, and the ground
//! truth every scroll-gesture heuristic tried to reconstruct. Only phase
//! TRANSITIONS are emitted, a handful per gesture; legacy mouse wheels carry
//! no phases and so emit nothing. No-op off macOS and Wayland.

use std::sync::atomic::{AtomicBool, Ordering};

/// While captured, the current gesture's remaining events are swallowed
/// before dispatch: the webview never sees them, so nothing scrolls and no
/// listener games are needed. The monitor drops the flag itself once the
/// gesture (momentum included) dies out.
static CAPTURE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_scroll_gesture_capture(capture: bool) {
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

#[cfg(target_os = "linux")]
pub fn follow_touchpad<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
	linux::follow(window);
}

#[cfg(any(target_os = "macos", target_os = "linux", test))]
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollGesture {
	#[serde(skip_serializing_if = "Option::is_none")]
	state: Option<&'static str>,
	// AppKit's scrollingDelta is what a native scroller would consume;
	// the webview's DOM deltas run noticeably hotter, so anything meant
	// to move at natural scroll speed must use these.
	#[serde(skip_serializing_if = "Option::is_none")]
	dx: Option<f64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	dy: Option<f64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	vx: Option<f64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	vy: Option<f64>,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GestureState {
	Idle,
	Fingers,
	Momentum,
}

#[cfg(any(target_os = "macos", test))]
pub const BEGAN: u64 = 1;
#[cfg(any(target_os = "macos", test))]
pub const STATIONARY: u64 = 2;
#[cfg(any(target_os = "macos", test))]
pub const CHANGED: u64 = 4;
#[cfg(any(target_os = "macos", test))]
pub const ENDED: u64 = 8;
#[cfg(any(target_os = "macos", test))]
pub const CANCELLED: u64 = 16;
#[cfg(any(target_os = "macos", test))]
pub const MAY_BEGIN: u64 = 32;

#[cfg(any(target_os = "macos", test))]
pub struct Phases {
	pub phase: u64,
	pub momentum: u64,
}

/// Collapses a scroll event's phase pair into the gesture state, and the
/// transition to announce. "released" rather than "idle" marks the instant
/// the fingers leave while the gesture may still coast.
#[cfg(any(target_os = "macos", test))]
pub fn classify(
	Phases { phase, momentum }: Phases,
	previous: GestureState,
) -> (GestureState, Option<&'static str>) {
	const ACTIVE: u64 = BEGAN | STATIONARY | CHANGED | MAY_BEGIN;
	const OVER: u64 = ENDED | CANCELLED;

	let next = if phase & ACTIVE != 0 {
		GestureState::Fingers
	} else if phase & OVER != 0 {
		GestureState::Idle
	} else if momentum & (BEGAN | CHANGED) != 0 {
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

#[cfg(any(target_os = "linux", test))]
const FLING_HISTORY_MS: u32 = 150;
#[cfg(any(target_os = "linux", test))]
const WEBKIT_PIXELS_PER_DELTA: f64 = 40.0;

#[cfg(any(target_os = "linux", test))]
#[derive(Default)]
pub struct TouchpadGesture {
	fingers_down: bool,
	recent: std::collections::VecDeque<(u32, f64, f64)>,
}

#[cfg(any(target_os = "linux", test))]
impl TouchpadGesture {
	#[cfg(target_os = "linux")]
	pub fn fingers_down(&self) -> bool {
		self.fingers_down
	}

	pub fn scroll(
		&mut self,
		time: u32,
		(dx, dy): (f64, f64),
		stop: bool,
		captured: bool,
	) -> Option<ScrollGesture> {
		self.recent
			.retain(|&(at, ..)| time.wrapping_sub(at) <= FLING_HISTORY_MS);
		self.recent.push_back((time, dx, dy));
		if stop {
			let (vx, vy) = self.velocity(time);
			return self.release(vx, vy);
		}
		if std::mem::replace(&mut self.fingers_down, true) {
			return captured.then(|| ScrollGesture {
				dx: Some(dx * WEBKIT_PIXELS_PER_DELTA),
				dy: Some(dy * WEBKIT_PIXELS_PER_DELTA),
				..ScrollGesture::default()
			});
		}
		Some(ScrollGesture {
			state: Some("fingers"),
			..ScrollGesture::default()
		})
	}

	pub fn leave(&mut self) -> Option<ScrollGesture> {
		self.release(0.0, 0.0)
	}

	fn release(&mut self, vx: f64, vy: f64) -> Option<ScrollGesture> {
		self.recent.clear();
		if !std::mem::take(&mut self.fingers_down) {
			return None;
		}
		Some(ScrollGesture {
			state: Some("released"),
			vx: Some(vx),
			vy: Some(vy),
			..ScrollGesture::default()
		})
	}

	fn velocity(&self, now: u32) -> (f64, f64) {
		let span = self
			.recent
			.front()
			.map_or(0, |&(first, ..)| now.wrapping_sub(first));
		if span == 0 {
			return (0.0, 0.0);
		}
		let (dx, dy) = self
			.recent
			.iter()
			.fold((0.0, 0.0), |(x, y), &(_, dx, dy)| (x + dx, y + dy));
		let pixels_per_ms =
			|delta: f64| delta * WEBKIT_PIXELS_PER_DELTA / f64::from(span);
		(pixels_per_ms(dx), pixels_per_ms(dy))
	}
}

#[cfg(target_os = "linux")]
mod linux {
	use std::cell::RefCell;
	use std::rc::Rc;
	use std::sync::atomic::Ordering;

	use gdk::glib::prelude::{ObjectExt, ToValue};
	use gdk::prelude::DeviceExt;
	use tauri::{Emitter, Manager, Runtime, WebviewWindow};

	use super::{ScrollGesture, TouchpadGesture, CAPTURE};

	fn from_touchpad(event: &gdk::Event) -> bool {
		event
			.source_device()
			.is_some_and(|device| device.source() == gdk::InputSource::Touchpad)
	}

	fn on_wayland() -> bool {
		gdk::Display::default().is_some_and(|display| {
			display.type_().name() == "GdkWaylandDisplay"
		})
	}

	pub fn follow<R: Runtime>(window: &WebviewWindow<R>) {
		let app = window.app_handle().clone();
		let followed = window.with_webview(move |webview| {
			if !on_wayland() {
				return;
			}
			let view = webview.inner();
			let gesture = Rc::new(RefCell::new(TouchpadGesture::default()));
			let announce = move |announced: Option<ScrollGesture>| {
				if let Some(announced) = announced {
					app.emit("scroll:gesture", announced).ok();
				}
			};

			let scrolled = Rc::clone(&gesture);
			let announce_scroll = announce.clone();
			view.connect_local("scroll-event", false, move |values| {
				let event = values
					.get(1)
					.and_then(|value| value.get::<gdk::Event>().ok())
					.filter(from_touchpad);
				let Some(scroll) = event
					.as_ref()
					.and_then(|event| event.downcast_ref::<gdk::EventScroll>())
				else {
					return Some(false.to_value());
				};
				let mid_gesture = scrolled.borrow().fingers_down();
				if !mid_gesture || scroll.is_stop() {
					CAPTURE.store(false, Ordering::Relaxed);
				}
				let captured = CAPTURE.load(Ordering::Relaxed);
				announce_scroll(scrolled.borrow_mut().scroll(
					scroll.time(),
					scroll.delta(),
					scroll.is_stop(),
					captured,
				));
				Some(captured.to_value())
			});

			view.connect_local("leave-notify-event", false, move |_| {
				CAPTURE.store(false, Ordering::Relaxed);
				announce(gesture.borrow_mut().leave());
				Some(false.to_value())
			});
		});
		if let Err(error) = followed {
			tracing::warn!("[scroll] cannot follow touchpad gestures: {error}");
		}
	}
}

#[cfg(target_os = "macos")]
mod macos {
	use std::cell::{Cell, RefCell};
	use std::ptr::NonNull;

	use block2::RcBlock;
	use objc2::rc::Retained;
	use objc2::runtime::AnyObject;
	use objc2_app_kit::{NSEvent, NSEventMask};
	use tauri::Emitter;

	use super::{classify, GestureState, Phases, ScrollGesture};

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
						Phases {
							phase: e.phase().0 as u64,
							momentum: e.momentumPhase().0 as u64,
						},
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
							..ScrollGesture::default()
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
	use super::{
		classify, GestureState, Phases, TouchpadGesture, BEGAN, CHANGED, ENDED,
	};

	const NONE: u64 = 0;

	#[test]
	fn a_finger_gesture_announces_each_transition_once() {
		let (state, announce) = classify(
			Phases {
				phase: BEGAN,
				momentum: NONE,
			},
			GestureState::Idle,
		);
		assert_eq!(state, GestureState::Fingers);
		assert_eq!(announce, Some("fingers"));

		let (state, announce) = classify(
			Phases {
				phase: CHANGED,
				momentum: NONE,
			},
			state,
		);
		assert_eq!(state, GestureState::Fingers);
		assert_eq!(announce, None);

		let (state, announce) = classify(
			Phases {
				phase: ENDED,
				momentum: NONE,
			},
			state,
		);
		assert_eq!(state, GestureState::Idle);
		assert_eq!(announce, Some("released"));
	}

	#[test]
	fn a_momentum_tail_is_bracketed_by_momentum_and_idle() {
		let (state, announce) = classify(
			Phases {
				phase: NONE,
				momentum: BEGAN,
			},
			GestureState::Idle,
		);
		assert_eq!(state, GestureState::Momentum);
		assert_eq!(announce, Some("momentum"));

		let (state, announce) = classify(
			Phases {
				phase: NONE,
				momentum: CHANGED,
			},
			state,
		);
		assert_eq!(announce, None);

		let (state, announce) = classify(
			Phases {
				phase: NONE,
				momentum: ENDED,
			},
			state,
		);
		assert_eq!(state, GestureState::Idle);
		assert_eq!(announce, Some("idle"));
	}

	#[test]
	fn a_mouse_wheel_with_no_phases_announces_nothing() {
		let (state, announce) = classify(
			Phases {
				phase: NONE,
				momentum: NONE,
			},
			GestureState::Idle,
		);
		assert_eq!(state, GestureState::Idle);
		assert_eq!(announce, None);
	}

	#[test]
	fn a_lift_straight_into_momentum_still_reports_the_release() {
		let (state, announce) = classify(
			Phases {
				phase: CHANGED,
				momentum: NONE,
			},
			GestureState::Idle,
		);
		assert_eq!(state, GestureState::Fingers);
		assert_eq!(announce, Some("fingers"));

		let (state, announce) = classify(
			Phases {
				phase: ENDED,
				momentum: NONE,
			},
			state,
		);
		assert_eq!(announce, Some("released"));

		let (_, announce) = classify(
			Phases {
				phase: NONE,
				momentum: BEGAN,
			},
			state,
		);
		assert_eq!(announce, Some("momentum"));
	}

	fn flick() -> TouchpadGesture {
		let mut gesture = TouchpadGesture::default();
		for time in (0..=96).step_by(8) {
			gesture.scroll(time, (1.0, 0.0), false, false);
		}
		gesture
	}

	#[test]
	fn a_touchpad_gesture_announces_its_fingers_once() {
		let mut gesture = TouchpadGesture::default();
		let first = gesture.scroll(0, (1.0, 0.0), false, false);
		assert_eq!(first.and_then(|g| g.state), Some("fingers"));
		assert_eq!(gesture.scroll(8, (1.0, 0.0), false, false), None);
	}

	#[test]
	fn a_flick_is_released_with_the_pixel_velocity_of_its_last_150_ms() {
		let released = flick().scroll(104, (0.0, 0.0), true, false).unwrap();
		assert_eq!(released.state, Some("released"));
		assert_eq!(released.vx, Some(13.0 * 40.0 / 104.0));
		assert_eq!(released.vy, Some(0.0));
	}

	#[test]
	fn fingers_that_rest_before_lifting_are_released_without_velocity() {
		let released = flick().scroll(300, (0.0, 0.0), true, false).unwrap();
		assert_eq!(released.vx, Some(0.0));
	}

	#[test]
	fn a_touchpad_stop_without_fingers_down_announces_nothing() {
		let mut gesture = TouchpadGesture::default();
		assert_eq!(gesture.scroll(0, (0.0, 0.0), true, false), None);
	}

	#[test]
	fn leaving_the_view_mid_gesture_releases_the_fingers_once() {
		let mut gesture = flick();
		assert_eq!(gesture.leave().and_then(|g| g.vx), Some(0.0));
		assert_eq!(gesture.leave(), None);
	}

	#[test]
	fn a_captured_gesture_forwards_its_motion_in_page_pixels() {
		let mut gesture = TouchpadGesture::default();
		let first = gesture.scroll(0, (0.0, -1.0), false, true);
		assert_eq!(first.and_then(|g| g.dy), None);
		let next = gesture.scroll(8, (0.25, -1.5), false, true).unwrap();
		assert_eq!(next.state, None);
		assert_eq!(next.dx, Some(10.0));
		assert_eq!(next.dy, Some(-60.0));
	}
}
