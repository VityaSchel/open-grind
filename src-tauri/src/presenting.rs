use std::cell::Cell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_ui_kit::{
	UIViewController, UIViewControllerTransitionCoordinator,
	UIViewControllerTransitionCoordinatorContext, UIWindow,
};

const REFUSED: &str = "UIKit refused the presentation";

pub struct Presentation<F: FnOnce(Result<(), &'static str>)> {
	pub host: Retained<UIViewController>,
	pub controller: Retained<UIViewController>,
	pub shown: F,
}

struct Unanswered<F: FnOnce(Result<(), &'static str>)>(
	Cell<Option<Presentation<F>>>,
);

impl<F: FnOnce(Result<(), &'static str>)> Drop for Unanswered<F> {
	fn drop(&mut self) {
		if let Some(presentation) = self.0.take() {
			(presentation.shown)(Err(REFUSED));
		}
	}
}

pub fn presenting(window: &UIWindow) -> bool {
	window
		.rootViewController()
		.and_then(|root| root.presentedViewController())
		.is_some_and(|presented| !presented.isBeingDismissed())
}

pub fn present_on_top<F: FnOnce(Result<(), &'static str>) + 'static>(
	mut presentation: Presentation<F>,
) {
	while let Some(presented) = presentation.host.presentedViewController() {
		if presented.isBeingDismissed() {
			after_dismissal(&presented, presentation);
			return;
		}
		presentation.host = presented;
	}
	let host = presentation.host.clone();
	let controller = presentation.controller.clone();
	let unanswered = Unanswered(Cell::new(Some(presentation)));
	let completion = RcBlock::new(move || {
		if let Some(presentation) = unanswered.0.take() {
			(presentation.shown)(Ok(()));
		}
	});
	host.presentViewController_animated_completion(
		&controller,
		true,
		Some(&completion),
	);
}

fn after_dismissal<F: FnOnce(Result<(), &'static str>) + 'static>(
	dismissing: &UIViewController,
	presentation: Presentation<F>,
) {
	let Some(coordinator) = dismissing.transitionCoordinator() else {
		(presentation.shown)(Err(REFUSED));
		return;
	};
	let unanswered = Unanswered(Cell::new(Some(presentation)));
	let retry = RcBlock::new(
		move |_: NonNull<
			ProtocolObject<dyn UIViewControllerTransitionCoordinatorContext>,
		>| {
			if let Some(presentation) = unanswered.0.take() {
				present_on_top(presentation);
			}
		},
	);
	coordinator.animateAlongsideTransition_completion(None, Some(&retry));
}
