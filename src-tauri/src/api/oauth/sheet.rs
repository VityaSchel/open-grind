use std::cell::RefCell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{
	define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly,
};
use objc2_foundation::NSString;
use objc2_ui_kit::{
	UIAction, UIAdaptivePresentationControllerDelegate, UIBarButtonItem,
	UIBarButtonSystemItem, UIColor, UIModalPresentationStyle,
	UINavigationController, UIPresentationController, UIRectEdge,
	UIUserInterfaceStyle, UIView, UIViewAutoresizing, UIViewController,
};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

use crate::MAIN_WINDOW_LABEL;

thread_local! {
	static PRESENTED: RefCell<Option<Presented>> = const { RefCell::new(None) };
}

struct Presented {
	navigation: Retained<UINavigationController>,
	_delegate: Retained<SheetDelegate>,
}

struct SignInWindow {
	app: AppHandle,
	label: String,
}

impl SignInWindow {
	fn close(&self) {
		if let Some(window) = self.app.get_webview_window(&self.label) {
			let _ = window.close();
		}
	}
}

define_class!(
	#[unsafe(super(NSObject))]
	#[thread_kind = MainThreadOnly]
	#[ivars = SignInWindow]
	struct SheetDelegate;

	unsafe impl NSObjectProtocol for SheetDelegate {}

	unsafe impl UIAdaptivePresentationControllerDelegate for SheetDelegate {
		#[unsafe(method(presentationControllerDidDismiss:))]
		fn presentation_controller_did_dismiss(
			&self,
			_controller: &UIPresentationController,
		) {
			self.ivars().close();
		}
	}
);

impl SheetDelegate {
	fn new(mtm: MainThreadMarker, sign_in: SignInWindow) -> Retained<Self> {
		let this = Self::alloc(mtm).set_ivars(sign_in);
		unsafe { msg_send![super(this), init] }
	}
}

pub fn present(window: &WebviewWindow, title: &'static str) {
	let app = window.app_handle().clone();
	let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
		return;
	};
	let page_window = window.clone();
	let label = window.label().to_owned();
	let _ = main.with_webview(move |main_webview| {
		let host = main_webview.view_controller() as usize;
		let _ = page_window.with_webview(move |page_webview| {
			let page = page_webview.inner() as usize;
			let Some(mtm) = MainThreadMarker::new() else {
				return;
			};
			let sign_in = SignInWindow { app, label };
			unsafe {
				show(
					mtm,
					host as *mut UIViewController,
					page as *mut UIView,
					title,
					sign_in,
				);
			}
		});
	});

	let app = window.app_handle().clone();
	window.on_window_event(move |event| {
		if matches!(event, WindowEvent::Destroyed) {
			let _ = app.run_on_main_thread(dismiss);
		}
	});
}

unsafe fn show(
	mtm: MainThreadMarker,
	host: *mut UIViewController,
	page: *mut UIView,
	title: &str,
	sign_in: SignInWindow,
) {
	let (Some(host), Some(page)) =
		(unsafe { Retained::retain(host) }, unsafe {
			Retained::retain(page)
		})
	else {
		return;
	};

	if let Some(window) = page.window() {
		window.setHidden(true);
	}
	let background = UIColor::colorWithRed_green_blue_alpha(
		10.0 / 255.0,
		10.0 / 255.0,
		10.0 / 255.0,
		1.0,
	);
	let content = UIViewController::new(mtm);
	content.setEdgesForExtendedLayout(UIRectEdge::None);
	if let Some(view) = content.view() {
		view.setBackgroundColor(Some(&background));
		page.removeFromSuperview();
		page.setFrame(view.bounds());
		page.setAutoresizingMask(
			UIViewAutoresizing::FlexibleWidth
				| UIViewAutoresizing::FlexibleHeight,
		);
		view.addSubview(&page);
	}

	let delegate = SheetDelegate::new(mtm, sign_in);
	let canceling = delegate.clone();
	let handler = RcBlock::new(move |_action: NonNull<UIAction>| {
		canceling.ivars().close();
	});
	let action =
		unsafe { UIAction::actionWithHandler(RcBlock::as_ptr(&handler), mtm) };
	let cancel = UIBarButtonItem::initWithBarButtonSystemItem_primaryAction(
		UIBarButtonItem::alloc(mtm),
		UIBarButtonSystemItem::Cancel,
		Some(&*action),
	);
	let item = content.navigationItem();
	item.setTitle(Some(&NSString::from_str(title)));
	item.setLeftBarButtonItem(Some(&cancel));

	let navigation = UINavigationController::initWithRootViewController(
		UINavigationController::alloc(mtm),
		&content,
	);
	navigation.setModalPresentationStyle(UIModalPresentationStyle::PageSheet);
	navigation.setOverrideUserInterfaceStyle(UIUserInterfaceStyle::Dark);
	if let Some(view) = navigation.view() {
		view.setBackgroundColor(Some(&background));
	}
	if let Some(controller) = navigation.presentationController() {
		unsafe {
			controller.setDelegate(Some(ProtocolObject::from_ref(&*delegate)))
		};
	}
	let mut presenter = host;
	while let Some(presented) = presenter.presentedViewController() {
		presenter = presented;
	}
	presenter.presentViewController_animated_completion(
		&navigation,
		true,
		None,
	);

	PRESENTED.with(|presented| {
		*presented.borrow_mut() = Some(Presented {
			navigation,
			_delegate: delegate,
		});
	});
}

fn dismiss() {
	let Some(presented) =
		PRESENTED.with(|presented| presented.borrow_mut().take())
	else {
		return;
	};
	presented
		.navigation
		.dismissViewControllerAnimated_completion(true, None);
}
