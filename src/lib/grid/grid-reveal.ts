import { revealRowScrollTop } from "$lib/util/grid-window";
import { readGridMetrics } from "$lib/util/virtual-grid.svelte";

export function revealedGridScrollTop({
	scroller,
	savedTop,
	index,
}: {
	scroller: HTMLElement;
	savedTop: number;
	index: number;
}): number {
	const content = scroller.querySelector('[data-slot="grid-content"]');
	const grid = scroller.querySelector<HTMLElement>(
		'[data-slot="grid-cells"]',
	);
	if (index < 0 || !content || !grid) return savedTop;

	const { columns, cellPx, gapPx } = readGridMetrics(grid);
	if (cellPx <= 0) return savedTop;

	const gridTopPx =
		grid.getBoundingClientRect().top -
		scroller.getBoundingClientRect().top +
		scroller.scrollTop;
	const insets = getComputedStyle(content);
	return revealRowScrollTop({
		savedTop,
		rowTopPx: gridTopPx + Math.floor(index / columns) * (cellPx + gapPx),
		rowHeightPx: cellPx,
		viewportPx: scroller.clientHeight,
		insetTopPx: Number.parseFloat(insets.paddingTop) || 0,
		insetBottomPx: Number.parseFloat(insets.paddingBottom) || 0,
		maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
	});
}
