//! Debug probe: mirrors every scroll-wheel NSEvent's gesture phase to the
//! webview, to verify that a local monitor sees the events WKWebView consumes.
//! The DOM never learns whether a wheel event is finger-driven or momentum;
//! AppKit knows, and this is the bridge candidate for gestures that must
//! distinguish the two. No-op off macOS and in release builds.

pub fn install_scroll_phase_probe<R: tauri::Runtime>(
	app: &tauri::AppHandle<R>,
) {
	#[cfg(all(target_os = "macos", debug_assertions))]
	macos::install(app.clone());

	#[cfg(not(all(target_os = "macos", debug_assertions)))]
	let _ = app;
}

#[cfg(all(target_os = "macos", debug_assertions))]
mod macos {
	use std::cell::RefCell;
	use std::ptr::NonNull;

	use block2::RcBlock;
	use objc2::rc::Retained;
	use objc2::runtime::AnyObject;
	use objc2_app_kit::{NSEvent, NSEventMask, NSEventPhase};
	use serde::Serialize;
	use tauri::Emitter;

	#[derive(Debug, Clone, Serialize)]
	#[serde(rename_all = "camelCase")]
	struct ScrollPhase {
		phase: &'static str,
		momentum: &'static str,
		delta_x: f64,
		delta_y: f64,
	}

	fn phase_name(phase: NSEventPhase) -> &'static str {
		match phase {
			NSEventPhase::Began => "began",
			NSEventPhase::Stationary => "stationary",
			NSEventPhase::Changed => "changed",
			NSEventPhase::Ended => "ended",
			NSEventPhase::Cancelled => "cancelled",
			NSEventPhase::MayBegin => "may-begin",
			_ => "none",
		}
	}

	thread_local! {
		static MONITOR: RefCell<Option<Retained<AnyObject>>> =
			const { RefCell::new(None) };
	}

	// The monitor observes only this process's own event stream, so no TCC
	// permission is involved; AppKit invokes the handler on the main thread.
	pub fn install<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
		let handler =
			RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
				let e = unsafe { event.as_ref() };
				app.emit(
					"debug:scroll-phase",
					ScrollPhase {
						phase: phase_name(e.phase()),
						momentum: phase_name(e.momentumPhase()),
						delta_x: e.scrollingDeltaX(),
						delta_y: e.scrollingDeltaY(),
					},
				)
				.ok();
				event.as_ptr()
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
