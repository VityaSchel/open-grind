use std::cell::{Cell, OnceCell, RefCell};
use std::ptr::NonNull;
use std::rc::Rc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
use objc2::MainThreadMarker;
use objc2_foundation::{
	NSNotification, NSNotificationCenter, NSOperationQueue, NSString,
};
use objc2_ui_kit::{
	UIApplication, UIApplicationWillEnterForegroundNotification,
	UIBackgroundTaskIdentifier, UIBackgroundTaskInvalid,
};
use tauri::{AppHandle, Runtime};

use super::TransferPurpose;

const TASK_NAME: &str = "Open Grind media upload";

thread_local! {
	static HOLDS: RefCell<Holds> = const {
		RefCell::new(Holds {
			active: 0,
			task: None,
		})
	};
	static FOREGROUND_OBSERVER: OnceCell<Observer> = const { OnceCell::new() };
}

type Observer = Retained<ProtocolObject<dyn NSObjectProtocol>>;

struct Holds {
	active: usize,
	task: Option<UIBackgroundTaskIdentifier>,
}

pub(super) fn begin_transfer<R: Runtime>(
	app: &AppHandle<R>,
	_purpose: TransferPurpose,
) {
	on_main_thread(app, hold);
}

pub(super) fn end_transfer<R: Runtime>(
	app: &AppHandle<R>,
	_purpose: TransferPurpose,
) {
	on_main_thread(app, release);
}

fn on_main_thread<R: Runtime>(app: &AppHandle<R>, work: fn(MainThreadMarker)) {
	let dispatched =
		app.run_on_main_thread(move || match MainThreadMarker::new() {
			Some(mtm) => work(mtm),
			None => tracing::warn!(
				"[transfer] background task left the main thread"
			),
		});
	if let Err(error) = dispatched {
		tracing::warn!("[transfer] could not reach the main thread: {error}");
	}
}

fn hold(mtm: MainThreadMarker) {
	HOLDS.with_borrow_mut(|holds| holds.active += 1);
	FOREGROUND_OBSERVER.with(|observer| {
		observer.get_or_init(rearm_on_foreground);
	});
	protect(mtm);
}

fn protect(mtm: MainThreadMarker) {
	if HOLDS.with_borrow(|holds| holds.active > 0 && holds.task.is_none()) {
		let task = begin(mtm);
		HOLDS.with_borrow_mut(|holds| holds.task = task);
	}
}

fn rearm_on_foreground() -> Observer {
	let returned = RcBlock::new(|_notification: NonNull<NSNotification>| {
		if let Some(mtm) = MainThreadMarker::new() {
			protect(mtm);
		}
	});
	unsafe {
		NSNotificationCenter::defaultCenter()
			.addObserverForName_object_queue_usingBlock(
				Some(UIApplicationWillEnterForegroundNotification),
				None,
				Some(&NSOperationQueue::mainQueue()),
				&returned,
			)
	}
}

fn release(mtm: MainThreadMarker) {
	let finished = HOLDS.with_borrow_mut(|holds| {
		holds.active = holds.active.saturating_sub(1);
		if holds.active == 0 {
			holds.task.take()
		} else {
			None
		}
	});
	if let Some(task) = finished {
		end(mtm, task);
	}
}

fn begin(mtm: MainThreadMarker) -> Option<UIBackgroundTaskIdentifier> {
	let begun = Rc::new(Cell::new(None));
	let expired = RcBlock::new({
		let begun = Rc::clone(&begun);
		move || expire(begun.get())
	});
	let task = UIApplication::sharedApplication(mtm)
		.beginBackgroundTaskWithName_expirationHandler(
			Some(&NSString::from_str(TASK_NAME)),
			Some(&expired),
		);
	if task == unsafe { UIBackgroundTaskInvalid } {
		return None;
	}
	begun.set(Some(task));
	Some(task)
}

fn expire(task: Option<UIBackgroundTaskIdentifier>) {
	let Some(mtm) = MainThreadMarker::new() else {
		return;
	};
	let expired = HOLDS.with_borrow_mut(|holds| {
		if task.is_some() && holds.task == task {
			holds.task.take()
		} else {
			None
		}
	});
	if let Some(task) = expired {
		end(mtm, task);
	}
}

fn end(mtm: MainThreadMarker, task: UIBackgroundTaskIdentifier) {
	UIApplication::sharedApplication(mtm).endBackgroundTask(task);
}
