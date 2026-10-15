const OPEN_OVERLAY = '[role="dialog"], [role="alertdialog"], dialog[open]';

export function escapeMeansBack(event: KeyboardEvent): boolean {
	if (event.defaultPrevented) return false;
	if (document.querySelector(OPEN_OVERLAY) !== null) return false;
	return !(
		event.target instanceof Element &&
		event.target.closest("[data-sonner-toaster]")
	);
}
