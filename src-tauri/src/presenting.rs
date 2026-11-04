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

struct Unanswered<F: FnOnce(Result<(), &'static str>)>(Cell<Option<F>>);

impl<F: FnOnce(Result<(), &'static str>)> Unanswered<F> {
	fn new(shown: F) -> Self {
		Self(Cell::new(Some(shown)))
	}

	fn take(&self) -> Option<F> {
		self.0.take()
	}
}

impl<F: FnOnce(Result<(), &'static str>)> Drop for Unanswered<F> {
	fn drop(&mut self) {
		if let Some(shown) = self.0.take() {
			shown(Err(REFUSED));
		}
	}
}

pub fn presenting(window: &UIWindow) -> bool {
	window
		.rootViewController()
		.and_then(|root| root.presentedViewController())
		.is_some_and(|presented| !presented.isBeingDismissed())
}

pub fn present_on_top(
	host: Retained<UIViewController>,
	controller: Retained<UIViewController>,
	shown: impl FnOnce(Result<(), &'static str>) + 'static,
) {
	let mut presenter = host;
	while let Some(presented) = presenter.presentedViewController() {
		if presented.isBeingDismissed() {
			after_dismissal(&presented, presenter, controller, shown);
			return;
		}
		presenter = presented;
	}
	let unanswered = Unanswered::new(shown);
	let completion = RcBlock::new(move || {
		if let Some(shown) = unanswered.take() {
			shown(Ok(()));
		}
	});
	presenter.presentViewController_animated_completion(
		&controller,
		true,
		Some(&completion),
	);
}

fn after_dismissal(
	dismissing: &UIViewController,
	presenter: Retained<UIViewController>,
	controller: Retained<UIViewController>,
	shown: impl FnOnce(Result<(), &'static str>) + 'static,
) {
	let Some(coordinator) = dismissing.transitionCoordinator() else {
		shown(Err(REFUSED));
		return;
	};
	let waiting = Cell::new(Some((presenter, controller)));
	let unanswered = Unanswered::new(shown);
	let retry = RcBlock::new(
		move |_: NonNull<
			ProtocolObject<dyn UIViewControllerTransitionCoordinatorContext>,
		>| {
			if let (Some((presenter, controller)), Some(shown)) =
				(waiting.take(), unanswered.take())
			{
				present_on_top(presenter, controller, shown);
			}
		},
	);
	coordinator.animateAlongsideTransition_completion(None, Some(&retry));
}
