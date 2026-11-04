use objc2::msg_send;
use objc2::rc::Retained;
use objc2_core_foundation::CGPoint;
use objc2_ui_kit::{UIScrollView, UIView};

pub fn child_scroller_at(
	webview: &UIView,
	target: CGPoint,
) -> Option<Retained<UIScrollView>> {
	let page: Option<Retained<UIScrollView>> =
		unsafe { msg_send![webview, scrollView] };
	let mut view = webview.hitTest_withEvent(target, None);
	while let Some(current) = view {
		match current.downcast::<UIScrollView>() {
			Ok(scroller) => {
				let is_page = page
					.as_deref()
					.is_some_and(|page| std::ptr::eq(page, &*scroller));
				return (!is_page).then_some(scroller);
			}
			Err(current) => view = current.superview(),
		}
	}
	None
}
