import type { GridMetrics, GridWindow } from "./grid-window";
import { NO_METRICS, virtualWindow } from "./virtual-window.svelte";

// Seeds a remount's first render, which precedes the effect's first measure —
// without it a warm grid mounts in full. Not $state: the measuring effect
// writes it.
let lastMetrics: GridMetrics = NO_METRICS;

function measureCells(element: HTMLElement): GridMetrics {
	const style = getComputedStyle(element);
	const tracks = style.gridTemplateColumns.trim().split(/\s+/);
	lastMetrics = {
		columns: tracks.length,
		cellPx: Number.parseFloat(tracks[0] ?? "") || 0,
		gapPx: Number.parseFloat(style.rowGap) || 0,
	};
	return lastMetrics;
}

export function virtualGrid({
	grid,
	count,
}: {
	grid: () => HTMLElement | null;
	count: () => number;
}): GridWindow {
	return virtualWindow({
		element: grid,
		count,
		measure: measureCells,
		initialMetrics: lastMetrics,
	});
}
