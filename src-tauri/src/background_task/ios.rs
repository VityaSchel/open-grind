use std::cell::{Cell, OnceCell, RefCell};
use std::rc::Rc;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2_foundation::NSString;
use objc2_ui_kit::{
	UIApplication, UIApplicationDidEnterBackgroundNotification,
	UIApplicationWillEnterForegroundNotification, UIBackgroundTaskInvalid,
};
use tauri::{AppHandle, Runtime};

use super::ledger::{Ledger, Purpose, Task};
use crate::uikit::{observe, on_main_thread, Observer};

thread_local! {
	static LEDGER: RefCell<Ledger> = const { RefCell::new(Ledger::new()) };
	static OBSERVERS: OnceCell<[Observer; 2]> = const { OnceCell::new() };
}

pub fn install<R: Runtime>(app: &AppHandle<R>) {
	on_main_thread(app, "background", |_| {
		OBSERVERS.with(|observers| {
			observers.get_or_init(|| unsafe {
				[
					observe(
						UIApplicationDidEnterBackgroundNotification,
						|mtm, _| backgrounded(mtm),
					),
					observe(
						UIApplicationWillEnterForegroundNotification,
						|mtm, _| foregrounded(mtm),
					),
				]
			});
		});
	});
}

pub fn deactivated<R: Runtime>(app: &AppHandle<R>) {
	on_main_thread(app, "background", |mtm| {
		let idle = LEDGER.with_borrow_mut(Ledger::deactivated);
		end(mtm, idle);
	});
}

impl Purpose {
	pub fn hold<R: Runtime>(self, app: &AppHandle<R>) {
		on_main_thread(app, "background", move |mtm| {
			LEDGER.with_borrow_mut(|ledger| ledger.slot(self).hold());
			protect(mtm);
		});
	}

	pub fn release<R: Runtime>(self, app: &AppHandle<R>) {
		on_main_thread(app, "background", move |mtm| {
			let idle =
				LEDGER.with_borrow_mut(|ledger| ledger.slot(self).release());
			end(mtm, idle);
		});
	}

	fn begin(self, mtm: MainThreadMarker) -> Option<Task> {
		let begun = Rc::new(Cell::new(None));
		let expired = RcBlock::new({
			let begun = Rc::clone(&begun);
			move || self.expire(begun.get())
		});
		let task = UIApplication::sharedApplication(mtm)
			.beginBackgroundTaskWithName_expirationHandler(
				Some(&NSString::from_str(self.task_name())),
				Some(&expired),
			);
		if task == unsafe { UIBackgroundTaskInvalid } {
			return None;
		}
		begun.set(Some(task));
		Some(task)
	}

	fn expire(self, task: Option<Task>) {
		let (Some(mtm), Some(task)) = (MainThreadMarker::new(), task) else {
			return;
		};
		let expired =
			LEDGER.with_borrow_mut(|ledger| ledger.slot(self).expired(task));
		end(mtm, expired);
	}
}

fn backgrounded(mtm: MainThreadMarker) {
	LEDGER.with_borrow_mut(Ledger::backgrounded);
	protect(mtm);
}

fn foregrounded(mtm: MainThreadMarker) {
	let idle = LEDGER.with_borrow_mut(Ledger::deactivated);
	end(mtm, idle);
	protect(mtm);
}

fn protect(mtm: MainThreadMarker) {
	for purpose in LEDGER.with_borrow(Ledger::unprotected) {
		if let Some(task) = purpose.begin(mtm) {
			LEDGER.with_borrow_mut(|ledger| ledger.slot(purpose).begun(task));
		}
	}
}

fn end(mtm: MainThreadMarker, task: Option<Task>) {
	if let Some(task) = task {
		UIApplication::sharedApplication(mtm).endBackgroundTask(task);
	}
}
