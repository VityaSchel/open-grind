import { cubicOut } from "svelte/easing";

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

export function glideScrollTop({
	element,
	durationMs,
	onLanded,
}: {
	element: HTMLElement;
	durationMs: number;
	onLanded: () => void;
}): () => void {
	const from = element.scrollTop;
	const start = performance.now();
	let frame = requestAnimationFrame(function step(now) {
		const progress = Math.min(1, Math.max(0, now - start) / durationMs);
		element.scrollTop = from * (1 - cubicOut(progress));
		if (progress < 1) frame = requestAnimationFrame(step);
		else onLanded();
	});
	return () => cancelAnimationFrame(frame);
}
