use std::cell::Cell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_ui_kit::{
	UIViewController, UIViewControllerTransitionCoordinator,
	UIViewControllerTransitionCoordinatorContext,
};

const REFUSED: &str = "UIKit refused the presentation";

struct Unanswered<F: FnOnce(Result<(), &'static str>)>(Option<F>);

impl<F: FnOnce(Result<(), &'static str>)> Drop for Unanswered<F> {
	fn drop(&mut self) {
		if let Some(shown) = self.0.take() {
			shown(Err(REFUSED));
		}
	}
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
	presenter.presentViewController_animated_completion(
		&controller,
		true,
		None,
	);
	shown(match controller.presentingViewController() {
		Some(_) => Ok(()),
		None => Err(REFUSED),
	});
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
	let waiting =
		Cell::new(Some((presenter, controller, Unanswered(Some(shown)))));
	let retry = RcBlock::new(
		move |_: NonNull<
			ProtocolObject<dyn UIViewControllerTransitionCoordinatorContext>,
		>| {
			if let Some((presenter, controller, mut unanswered)) =
				waiting.take()
			{
				if let Some(shown) = unanswered.0.take() {
					present_on_top(presenter, controller, shown);
				}
			}
		},
	);
	coordinator.animateAlongsideTransition_completion(None, Some(&retry));
}
