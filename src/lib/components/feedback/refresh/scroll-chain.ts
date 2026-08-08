import { hasScrollableOverflowY } from "$lib/util/scroll";

export type PullPosition = "top" | "bottom";

export const AT_BOUNDARY_PX = 1;

function isScrollableY(el: Element): boolean {
	return hasScrollableOverflowY(el) && el.scrollHeight > el.clientHeight + 1;
}

function canScrollToward({
	el,
	position,
}: {
	el: Element;
	position: PullPosition;
}): boolean {
	return position === "top"
		? el.scrollTop > 0
		: el.scrollTop < el.scrollHeight - el.clientHeight - 1;
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

export function chainAllowsPull({
	start,
	root,
	position,
}: {
	start: EventTarget | null;
	root: Element;
	position: PullPosition;
}): boolean {
	const rootIsDocument = root === document.documentElement;
	if (rootIsDocument ? viewportScrollLocked() : isScrollLocked(root))
		return false;

	let el = start instanceof Element ? start : null;
	if (el === root) return true;
	while (el && el !== root) {
		if (isScrollableY(el) && canScrollToward({ el, position }))
			return false;
		el = el.parentElement;
	}
	return el === root || (rootIsDocument && el === null);
}
