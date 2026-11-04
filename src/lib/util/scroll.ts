import { cubicOut } from "svelte/easing";
import { prefersReducedMotion } from "svelte/motion";

import { stopScrollMomentum } from "#lib/platform/scroll-momentum.ts";

const TOP_GLIDE_MS = 400;
const TAKEOVER_LISTENER = { passive: true } as const;
const theTop = () => 0;

const glidesToTop = new WeakMap<HTMLElement, () => void>();

export function hasScrollableOverflowY(el: Element): boolean {
	const { overflowY } = getComputedStyle(el);
	return overflowY === "auto" || overflowY === "scroll";
}

export function nearestScrollableAncestor(node: Element): Element | null {
	let el = node.parentElement;
	while (el) {
		if (hasScrollableOverflowY(el)) return el;
		el = el.parentElement;
	}
	return null;
}

function glideScrollTop({
	element,
	landing,
	onLanded,
}: {
	element: HTMLElement;
	landing: () => number;
	onLanded: () => void;
}): () => void {
	const distance = element.scrollTop - landing();
	const start = performance.now();
	let frame = requestAnimationFrame(function step(now) {
		const progress = Math.min(1, Math.max(0, now - start) / TOP_GLIDE_MS);
		element.scrollTop = landing() + distance * (1 - cubicOut(progress));
		if (progress < 1) frame = requestAnimationFrame(step);
		else onLanded();
	});
	return () => cancelAnimationFrame(frame);
}

export function followInsertionsAbove({
	scroller,
	anchor,
}: {
	scroller: HTMLElement;
	anchor: HTMLElement;
}): () => number {
	const contentOffset = () =>
		anchor.getBoundingClientRect().top -
		scroller.getBoundingClientRect().top +
		scroller.scrollTop;
	const startOffset = contentOffset();
	let inserted = 0;
	return () => {
		if (anchor.isConnected)
			inserted = Math.max(0, contentOffset() - startOffset);
		return inserted;
	};
}

export function glidingToTop(element: HTMLElement): boolean {
	return glidesToTop.has(element);
}

export function stopGlidingToTop(element: HTMLElement): void {
	glidesToTop.get(element)?.();
}

export function jumpThenGlideToTop({
	element,
	landing = theTop,
	onLanded,
}: {
	element: HTMLElement;
	landing?: () => number;
	onLanded?: () => void;
}): void {
	stopGlidingToTop(element);
	const ending = new AbortController();
	let stopFrames = () => {};
	const end = () => {
		ending.abort();
		stopFrames();
		if (glidesToTop.get(element) === end) glidesToTop.delete(element);
	};
	const land = () => {
		end();
		onLanded?.();
	};
	const begin = () => {
		if (ending.signal.aborted) return;
		if (prefersReducedMotion.current) {
			element.scrollTop = landing();
			land();
			return;
		}
		element.scrollTop = Math.min(
			element.scrollTop,
			landing() + element.clientHeight,
		);
		stopFrames = glideScrollTop({ element, landing, onLanded: land });
	};

	glidesToTop.set(element, end);
	const takeover = { ...TAKEOVER_LISTENER, signal: ending.signal };
	element.addEventListener("touchstart", end, takeover);
	element.addEventListener("wheel", end, takeover);
	const stopping = stopScrollMomentum(element);
	if (stopping) void stopping.then(begin);
	else begin();
}
