import { gridWindow, type GridWindow } from "./grid-window";
import { nearestScrollableAncestor } from "./scroll";

const OVERSCAN_PX = 600;

// Seeds a remount's first render, which precedes the effect's first measure —
// without it a warm list mounts in full. Not $state: the effect writes these.
let lastMetrics = { columns: 0, cellPx: 0, gapPx: 0 };

export function virtualGrid({
	grid,
	count,
}: {
	grid: () => HTMLElement | null;
	count: () => number;
}): GridWindow {
	let columns = $state(lastMetrics.columns);
	let cellPx = $state(lastMetrics.cellPx);
	let gapPx = $state(lastMetrics.gapPx);
	let offsetPx = $state(0);
	let viewportPx = $state(0);

	$effect(() => {
		const element = grid();
		const scroller = element && nearestScrollableAncestor(element);
		if (!element || !scroller) {
			columns = 0;
			cellPx = 0;
			gapPx = 0;
			return;
		}

		const measure = () => {
			const style = getComputedStyle(element);
			const tracks = style.gridTemplateColumns.trim().split(/\s+/);
			lastMetrics = {
				columns: tracks.length,
				cellPx: Number.parseFloat(tracks[0] ?? "") || 0,
				gapPx: Number.parseFloat(style.rowGap) || 0,
			};
			columns = lastMetrics.columns;
			cellPx = lastMetrics.cellPx;
			gapPx = lastMetrics.gapPx;
		};
		const sample = () => {
			const view = scroller.getBoundingClientRect();
			offsetPx = view.top - element.getBoundingClientRect().top;
			viewportPx = view.height;
		};

		measure();
		sample();

		const resize = new ResizeObserver(() => {
			measure();
			sample();
		});
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
