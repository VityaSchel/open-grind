import { type GridMetrics, gridWindow, type GridWindow } from "./grid-window";
import { nearestScrollableAncestor } from "./scroll";

const OVERSCAN_PX = 600;

export const NO_METRICS: GridMetrics = Object.freeze({
	columns: 0,
	cellPx: 0,
	gapPx: 0,
});

export function virtualWindow({
	element,
	count,
	measure,
	initialMetrics = NO_METRICS,
}: {
	element: () => HTMLElement | null;
	count: () => number;
	measure: (element: HTMLElement) => GridMetrics;
	initialMetrics?: GridMetrics;
}): GridWindow {
	let columns = $state(initialMetrics.columns);
	let cellPx = $state(initialMetrics.cellPx);
	let gapPx = $state(initialMetrics.gapPx);
	let offsetPx = $state(0);
	let viewportPx = $state(0);

	$effect(() => {
		const node = element();
		const scroller = node && nearestScrollableAncestor(node);
		if (!node || !scroller) {
			columns = 0;
			cellPx = 0;
			gapPx = 0;
			return;
		}

		const sample = () => {
			const view = scroller.getBoundingClientRect();
			offsetPx = view.top - node.getBoundingClientRect().top;
			viewportPx = view.height;
		};
		const remeasure = () => {
			const metrics = measure(node);
			columns = metrics.columns;
			cellPx = metrics.cellPx;
			gapPx = metrics.gapPx;
			sample();
		};

		remeasure();

		const resize = new ResizeObserver(remeasure);
		resize.observe(scroller);
		scroller.addEventListener("scroll", sample, { passive: true });

		return () => {
			resize.disconnect();
			scroller.removeEventListener("scroll", sample);
		};
	});

	const view = $derived(
		gridWindow({
			count: count(),
			metrics: { columns, cellPx, gapPx },
			offsetPx,
			viewportPx,
			overscanPx: OVERSCAN_PX,
		}),
	);
	const startIndex = $derived(view.startIndex);
	const endIndex = $derived(view.endIndex);
	const paddingTopPx = $derived(view.paddingTopPx);
	const paddingBottomPx = $derived(view.paddingBottomPx);
	const hasRowsAbove = $derived(view.hasRowsAbove);
	const hasRowsBelow = $derived(view.hasRowsBelow);

	return {
		get startIndex() {
			return startIndex;
		},
		get endIndex() {
			return endIndex;
		},
		get paddingTopPx() {
			return paddingTopPx;
		},
		get paddingBottomPx() {
			return paddingBottomPx;
		},
		get hasRowsAbove() {
			return hasRowsAbove;
		},
		get hasRowsBelow() {
			return hasRowsBelow;
		},
	};
}
