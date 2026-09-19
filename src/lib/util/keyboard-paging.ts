const KEYBOARD_TRAPS =
	'[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="slider"],[role="radiogroup"],[role="tablist"]';

export function keyboardPagingBlocked({
	event,
	lightboxBusy,
}: {
	event: KeyboardEvent;
	lightboxBusy: boolean;
}): boolean {
	if (event.defaultPrevented || lightboxBusy) return true;
	if (document.querySelector('[aria-modal="true"]')) return true;
	return document.activeElement?.closest(KEYBOARD_TRAPS) !== null;
}
