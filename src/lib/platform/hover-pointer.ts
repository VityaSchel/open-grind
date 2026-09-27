export const HOVER_POINTER_ROOT_ATTRIBUTE = "data-hover-pointer";

export function trackHoverPointer(): () => void {
	const root = document.documentElement;
	root.toggleAttribute(
		HOVER_POINTER_ROOT_ATTRIBUTE,
		matchMedia("(hover: hover)").matches,
	);
	const listening = new AbortController();
	const options = { capture: true, passive: true, signal: listening.signal };
	window.addEventListener(
		"pointermove",
		(event) => {
			if (event.isTrusted && event.buttons === 0) {
				root.toggleAttribute(HOVER_POINTER_ROOT_ATTRIBUTE, true);
			}
		},
		options,
	);
	window.addEventListener(
		"pointerdown",
		(event) => {
			if (event.isTrusted && event.pointerType === "touch") {
				root.toggleAttribute(HOVER_POINTER_ROOT_ATTRIBUTE, false);
			}
		},
		options,
	);
	return () => {
		listening.abort();
		root.removeAttribute(HOVER_POINTER_ROOT_ATTRIBUTE);
	};
}
