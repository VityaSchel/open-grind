use std::ptr::NonNull;

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObjectProtocol, ProtocolObject};
use objc2::{msg_send, MainThreadMarker};
use objc2_foundation::{
	NSError, NSNotification, NSNotificationCenter, NSNotificationName,
	NSOperationQueue, NSString,
};
use objc2_ui_kit::{UIScrollView, UIView};
use tauri::{AppHandle, Runtime, WebviewWindow};

pub type Observer = Retained<ProtocolObject<dyn NSObjectProtocol>>;

pub fn evaluate(webview: &UIView, script: &str) {
	let script = NSString::from_str(script);
	let completion: Option<&DynBlock<dyn Fn(*mut AnyObject, *mut NSError)>> =
		None;
	let _: () = unsafe {
		msg_send![
			webview,
			evaluateJavaScript: &*script,
			completionHandler: completion
		]
	};
}

pub fn page_scroller(webview: &UIView) -> Option<Retained<UIScrollView>> {
	unsafe { msg_send![webview, scrollView] }
}

pub fn with_webview(
	window: &WebviewWindow,
	tag: &'static str,
	run: impl FnOnce(MainThreadMarker, Retained<UIView>) + Send + 'static,
) {
	let reached = window.with_webview(move |webview| {
		let Some(mtm) = MainThreadMarker::new() else {
			tracing::warn!("[{tag}] the webview left the main thread");
			return;
		};
		match unsafe { Retained::retain(webview.inner().cast::<UIView>()) } {
			Some(webview) => run(mtm, webview),
			None => tracing::warn!("[{tag}] the webview is gone"),
		}
	});
	if let Err(error) = reached {
		tracing::warn!("[{tag}] could not reach the webview: {error}");
	}
}

pub fn on_main_thread<R: Runtime>(
	app: &AppHandle<R>,
	tag: &'static str,
	run: impl FnOnce(MainThreadMarker) + Send + 'static,
) {
	let dispatched =
		app.run_on_main_thread(move || match MainThreadMarker::new() {
			Some(mtm) => run(mtm),
			None => tracing::warn!("[{tag}] the task left the main thread"),
		});
	if let Err(error) = dispatched {
		tracing::warn!("[{tag}] could not reach the main thread: {error}");
	}
}

pub fn observe(
	name: &NSNotificationName,
	react: impl Fn(MainThreadMarker, &NSNotification) + 'static,
) -> Observer {
	let block = RcBlock::new(move |notification: NonNull<NSNotification>| {
		if let Some(mtm) = MainThreadMarker::new() {
			react(mtm, unsafe { notification.as_ref() });
		}
	});
	unsafe {
		NSNotificationCenter::defaultCenter()
			.addObserverForName_object_queue_usingBlock(
				Some(name),
				None,
				Some(&NSOperationQueue::mainQueue()),
				&block,
			)
	}
}
