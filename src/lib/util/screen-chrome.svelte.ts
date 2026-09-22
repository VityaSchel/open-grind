import { SvelteMap } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

type Edge = "top" | "bottom";

function contentClearance(edge: Edge, element: HTMLElement): number {
	const box = element.getBoundingClientRect();
	const style = getComputedStyle(element);
	return edge === "top"
		? box.bottom - parseFloat(style.paddingBottom)
		: window.innerHeight - (box.top + parseFloat(style.paddingTop));
}

function edgeChrome(edge: Edge) {
	const clearances = new SvelteMap<HTMLElement, number>();

	const measure = (element: HTMLElement) => {
		if (element.inert || element.getClientRects().length === 0) {
			clearances.delete(element);
			return;
		}
		clearances.set(element, contentClearance(edge, element));
	};

	const attach: Attachment<HTMLElement> = (element) => {
		const remeasure = () => measure(element);
		const movesWithItsScroller =
			getComputedStyle(element).position === "sticky";
		const observer = new ResizeObserver(remeasure);
		observer.observe(element);
		window.addEventListener("resize", remeasure);
		element.addEventListener("introend", remeasure);
		element.addEventListener("outrostart", remeasure);
		if (movesWithItsScroller)
			window.addEventListener("scroll", remeasure, {
				capture: true,
				passive: true,
			});
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", remeasure);
			element.removeEventListener("introend", remeasure);
			element.removeEventListener("outrostart", remeasure);
			window.removeEventListener("scroll", remeasure, { capture: true });
			clearances.delete(element);
		};
	};

	return {
		attach,
		clearance: () => Math.max(0, ...clearances.values()),
		remeasure: () => {
			for (const element of clearances.keys()) measure(element);
		},
	};
}

const top = edgeChrome("top");
const bottom = edgeChrome("bottom");

export const topChrome = top.attach;
export const bottomChrome = bottom.attach;
export const topChromeClearance = top.clearance;
export const bottomChromeClearance = bottom.clearance;

export function remeasureScreenChrome(): void {
	top.remeasure();
	bottom.remeasure();
}
