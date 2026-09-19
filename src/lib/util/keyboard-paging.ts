const KEYBOARD_TRAPS =
	'[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="slider"],[role="radiogroup"],[role="tablist"]';

export type ArrowKeyAction = "page" | "swallow" | "ignore";

export function arrowKeyAction({
	event,
	lightboxBusy,
}: {
	event: KeyboardEvent;
	lightboxBusy: boolean;
}): ArrowKeyAction {
	if (event.defaultPrevented) return "ignore";
	if (lightboxBusy) return "swallow";
	if (document.querySelector('[aria-modal="true"]')) return "ignore";
	if (document.activeElement?.closest(KEYBOARD_TRAPS)) return "ignore";
	return "page";
}
