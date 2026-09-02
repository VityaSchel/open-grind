import { nearestScrollableAncestor } from "$lib/util/scroll";

export const TRANSPARENT_PIXEL =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const PREFETCH_MARGIN_PX = 400;
export const SETTLE_MS = 90;

const FLING_PX_PER_MS = 2;

type Fling = { waiting: Set<() => void>; fast: boolean; stop: () => void };

const flings = new WeakMap<Element, Fling>();

function flingOf(scroller: Element): Fling {
	const cached = flings.get(scroller);
	if (cached) return cached;

	const fling: Fling = { waiting: new Set(), fast: false, stop: () => {} };
	let top = scroller.scrollTop;
	let at = performance.now();
	let settling: ReturnType<typeof setTimeout> | undefined;

	const settle = () => {
		fling.fast = false;
		for (const resume of [...fling.waiting]) resume();
	};
	const sample = () => {
		const now = performance.now();
		const elapsed = now - at;
		if (elapsed <= 0) return;
		fling.fast =
			Math.abs(scroller.scrollTop - top) / elapsed > FLING_PX_PER_MS;
		top = scroller.scrollTop;
		at = now;
		clearTimeout(settling);
		settling = setTimeout(settle, SETTLE_MS);
	};

	scroller.addEventListener("scroll", sample, { passive: true });
	fling.stop = () => {
		scroller.removeEventListener("scroll", sample);
		clearTimeout(settling);
		flings.delete(scroller);
	};
	flings.set(scroller, fling);
	return fling;
}

function reachesViewport(entry: IntersectionObserverEntry): boolean {
	const expanded = entry.rootBounds;
	if (!expanded) return true;
	const rect = entry.boundingClientRect;
	return (
		rect.bottom > expanded.top + PREFETCH_MARGIN_PX &&
		rect.top < expanded.bottom - PREFETCH_MARGIN_PX
	);
}

export function loadWhenVisible(
	node: HTMLElement,
	commit: (() => void) | undefined,
): { destroy: () => void } {
	if (commit === undefined) return { destroy: () => {} };
	if (typeof IntersectionObserver === "undefined") {
		commit();
		return { destroy: () => {} };
	}

	const scroller = nearestScrollableAncestor(node);
	const fling = scroller ? flingOf(scroller) : null;
	let live = true;
	let visible = false;
	let onScreen = false;

	const observer = new IntersectionObserver(
		(entries) => {
			const entry = entries.at(-1);
			if (!entry) return;
			visible = entry.isIntersecting;
			onScreen = visible && reachesViewport(entry);
			attempt();
		},
		{ root: scroller, rootMargin: `${PREFETCH_MARGIN_PX}px` },
	);

	function release() {
		if (!live) return;
		live = false;
		observer.disconnect();
		if (!fling) return;
		fling.waiting.delete(attempt);
		if (fling.waiting.size === 0) fling.stop();
	}

	function attempt() {
		if (!live || !visible) return;
		if (fling?.fast && !onScreen) return;
		release();
		commit?.();
	}

	observer.observe(node);
	fling?.waiting.add(attempt);
	return { destroy: release };
}
