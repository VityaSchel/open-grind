export type PullPosition = "top" | "bottom";

export const AT_BOUNDARY_PX = 1;

function hasScrollableOverflowY(el: Element): boolean {
	const { overflowY } = getComputedStyle(el);
	return overflowY === "auto" || overflowY === "scroll";
}

function isScrollableY(el: Element): boolean {
	return hasScrollableOverflowY(el) && el.scrollHeight > el.clientHeight + 1;
}

function canScrollToward(el: Element, position: PullPosition): boolean {
	return position === "top"
		? el.scrollTop > 0
		: el.scrollTop < el.scrollHeight - el.clientHeight - 1;
}

/**
 * The `root` to give an IntersectionObserver when the sentinel lives inside a
 * scroll container. Container hides the sentinel if you leave it out, so the
 * rootMargin preload never fires.
 */
export function nearestScrollableAncestor(node: Element): Element | null {
	let el = node.parentElement;
	while (el) {
		if (hasScrollableOverflowY(el)) return el;
		el = el.parentElement;
	}
	return null;
}

function isScrollLocked(el: Element): boolean {
	const { overflow, overflowY } = getComputedStyle(el);
	return (
		overflow === "hidden" ||
		overflowY === "hidden" ||
		overflow === "clip" ||
		overflowY === "clip"
	);
}

const viewportScrollLocked = () =>
	isScrollLocked(document.documentElement) ||
	(!!document.body && isScrollLocked(document.body));

/** Copies how the browser chains scrolls. An open drawer locks the root. */
export function chainAllowsPull(
	start: EventTarget | null,
	root: Element,
	position: PullPosition,
): boolean {
	const rootIsDocument = root === document.documentElement;
	if (rootIsDocument ? viewportScrollLocked() : isScrollLocked(root))
		return false;

	let el = start instanceof Element ? start : null;
	if (el === root) return true;
	while (el && el !== root) {
		if (isScrollableY(el) && canScrollToward(el, position)) return false;
		el = el.parentElement;
	}
	return el === root || (rootIsDocument && el === null);
}
