import type { GridMetrics, GridWindow } from "./grid-window";
import { virtualWindow } from "./virtual-window.svelte";

function measureRows(element: HTMLElement): GridMetrics {
	const style = getComputedStyle(element);
	return {
		columns: 1,
		cellPx: Number.parseFloat(style.gridAutoRows) || 0,
		gapPx: Number.parseFloat(style.rowGap) || 0,
	};
}

export function virtualList({
	list,
	count,
}: {
	list: () => HTMLElement | null;
	count: () => number;
}): GridWindow {
	return virtualWindow({ element: list, count, measure: measureRows });
}
