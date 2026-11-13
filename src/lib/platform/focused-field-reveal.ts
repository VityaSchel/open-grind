import { currentPlatform } from "#lib/platform/os.ts";
import { topChromeClearance } from "#lib/util/screen-chrome.svelte.ts";
import { nearestScrollableAncestor } from "#lib/util/scroll.ts";
import { typesText } from "#lib/util/text-entry.ts";

const BOTTOM_CHROME = '[data-screen-chrome="bottom"]';

let keyboardOpen = false;
let focusedFieldRevealFrame: number | undefined;
let revealContainer: { element: Element; observer: ResizeObserver } | undefined;

function keyboardCoversFocusedField(): boolean {
	switch (currentPlatform()) {
		case "ios":
			return true;
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}

function watchRevealContainer(element: Element | null) {
	if (revealContainer?.element === element) return;
	revealContainer?.observer.disconnect();
	revealContainer = undefined;
	if (!element) return;
	const observer = new ResizeObserver(revealFocusedFieldUnderKeyboard);
	observer.observe(element);
	revealContainer = { element, observer };
}

function bottomChromeTop({
	field,
	container,
}: {
	field: Element;
	container: Element;
}): number {
	let top = Infinity;
	for (const chrome of container.querySelectorAll(BOTTOM_CHROME)) {
		const below =
			field.compareDocumentPosition(chrome) &
			Node.DOCUMENT_POSITION_FOLLOWING;
		const box = chrome.getBoundingClientRect();
		if (below && box.height > 0) top = Math.min(top, box.top);
	}
	return top;
}

function visibleBandOf({
	field,
	container,
}: {
	field: Element;
	container: Element;
}): { top: number; bottom: number } {
	const top = container.getBoundingClientRect().top + container.clientTop;
	return {
		top: Math.max(top, topChromeClearance()),
		bottom: Math.min(
			window.innerHeight,
			top + container.clientHeight,
			bottomChromeTop({ field, container }),
		),
	};
}

function revealFocusedField() {
	focusedFieldRevealFrame = undefined;
	if (!keyboardOpen) return;
	const field = document.activeElement;
	if (!typesText(field)) return;
	const container = nearestScrollableAncestor(field);
	watchRevealContainer(container);
	const box = field.getBoundingClientRect();
	if (!container) {
		if (box.bottom > window.innerHeight)
			field.scrollIntoView({ block: "nearest" });
		return;
	}
	const band = visibleBandOf({ field, container });
	const shift = Math.min(box.bottom - band.bottom, box.top - band.top);
	if (shift > 0) container.scrollBy({ top: shift });
}

function revealFocusedFieldUnderKeyboard() {
	if (!keyboardOpen || !keyboardCoversFocusedField()) return;
	if (focusedFieldRevealFrame !== undefined) return;
	focusedFieldRevealFrame = requestAnimationFrame(revealFocusedField);
}

export function noteKeyboardOpenForReveal({ open }: { open: boolean }): void {
	if (!open) watchRevealContainer(null);
	keyboardOpen = open;
	revealFocusedFieldUnderKeyboard();
}

export function installFocusedFieldReveal(): () => void {
	window.addEventListener("resize", revealFocusedFieldUnderKeyboard);
	window.addEventListener("focusin", revealFocusedFieldUnderKeyboard);
	window.addEventListener("introend", revealFocusedFieldUnderKeyboard, {
		capture: true,
	});
	return () => {
		window.removeEventListener("resize", revealFocusedFieldUnderKeyboard);
		window.removeEventListener("focusin", revealFocusedFieldUnderKeyboard);
		window.removeEventListener(
			"introend",
			revealFocusedFieldUnderKeyboard,
			{ capture: true },
		);
		if (focusedFieldRevealFrame !== undefined)
			cancelAnimationFrame(focusedFieldRevealFrame);
		focusedFieldRevealFrame = undefined;
		watchRevealContainer(null);
	};
}
