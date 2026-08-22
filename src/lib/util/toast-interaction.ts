export function exemptToastsFromDismissal(
	next?: (event: PointerEvent) => void,
): (event: PointerEvent) => void {
	return (event) => {
		if (
			event.target instanceof Element &&
			event.target.closest("[data-sonner-toaster]")
		) {
			event.preventDefault();
			return;
		}
		next?.(event);
	};
}
