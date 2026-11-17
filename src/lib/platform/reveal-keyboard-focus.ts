import { stopScrollAnimation } from "#lib/util/scroll-keys.ts";
import { nearestScrollableAncestor } from "#lib/util/scroll.ts";

export type Band = { top: number; bottom: number };

type SettleWatch = {
	scroller: EventTarget;
	signal: AbortSignal;
	settled: () => void;
};

const ROVING_HOLDER = "data-roving-holder";
const SCROLL_SETTLE_FALLBACK_MS = 150;
const LEFT_IN_PLACE = `input, textarea, [${ROVING_HOLDER}]`;

export function revealKeyboardFocus(): () => void {
	const listening = new AbortController();
	document.addEventListener(
		"focusin",
		({ target }) => {
			if (
				target instanceof Element &&
				target.matches(":focus-visible") &&
				!target.matches(LEFT_IN_PLACE)
			) {
				const scroller = nearestScrollableAncestor(target);
				if (scroller !== null) stopScrollAnimation(scroller);
				target.scrollIntoView({ block: "nearest", inline: "nearest" });
			}
		},
		{ signal: listening.signal },
	);
	return () => {
		listening.abort();
	};
}

export function holdFocusInPlace(container: HTMLElement): () => void {
	const tabindex = container.getAttribute("tabindex");
	const outline = container.style.outline;
	container.setAttribute("tabindex", "-1");
	container.setAttribute(ROVING_HOLDER, "");
	container.style.outline = "none";
	container.focus({ preventScroll: true });
	const restore = () => {
		if (tabindex === null) container.removeAttribute("tabindex");
		else container.setAttribute("tabindex", tabindex);
		container.removeAttribute(ROVING_HOLDER);
		container.style.outline = outline;
	};
	return () => {
		if (document.activeElement === container)
			container.addEventListener("blur", restore, { once: true });
		else restore();
	};
}

export function isRendered(element: HTMLElement): boolean {
	return !("checkVisibility" in element) || element.checkVisibility();
}

export function wasDisplaced({
	element,
	records,
}: {
	element: Element;
	records: MutationRecord[];
}): boolean {
	return (
		!element.isConnected ||
		element.closest("[inert]") !== null ||
		records.some((record) =>
			[...record.addedNodes, ...record.removedNodes].some((node) =>
				node.contains(element),
			),
		)
	);
}

export function focusIsLost(): boolean {
	const active = document.activeElement;
	return active === null || active === document.body;
}

export function visibleBand(scroller: Element | null): Band {
	if (scroller === null) return { top: 0, bottom: innerHeight };
	const { top, bottom } = scroller.getBoundingClientRect();
	const style = getComputedStyle(scroller);
	const paddingTop = Number.parseFloat(style.scrollPaddingTop) || 0;
	const paddingBottom = Number.parseFloat(style.scrollPaddingBottom) || 0;
	return {
		top: Math.max(0, top + paddingTop),
		bottom: Math.min(innerHeight, bottom - paddingBottom),
	};
}

export function fitsInBand({
	element,
	band,
}: {
	element: Element;
	band: Band;
}): boolean {
	if (
		"checkVisibility" in element &&
		!element.checkVisibility({ contentVisibilityAuto: true })
	)
		return false;
	const { top, bottom } = element.getBoundingClientRect();
	return top >= band.top - 0.5 && bottom <= band.bottom + 0.5;
}

export function listenForScrollSettle({
	scroller,
	signal,
	settled,
}: SettleWatch): void {
	const listening = { passive: true, signal };
	if ("onscrollend" in window) {
		scroller.addEventListener("scrollend", settled, listening);
		return;
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	const debounce = () => {
		clearTimeout(timer);
		timer = setTimeout(settled, SCROLL_SETTLE_FALLBACK_MS);
	};
	scroller.addEventListener("scroll", debounce, listening);
	signal.addEventListener("abort", () => clearTimeout(timer));
}
