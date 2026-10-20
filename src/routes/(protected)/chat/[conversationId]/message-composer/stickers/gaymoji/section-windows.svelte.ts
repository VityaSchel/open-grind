import { flushSync } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

import {
	type GridMetrics,
	gridWindow,
	type GridWindow,
} from "$lib/util/grid-window";
import { nearestScrollableAncestor } from "$lib/util/scroll";
import {
	NO_METRICS,
	OVERSCAN_PX,
	perFieldWindow,
} from "$lib/util/virtual-window.svelte";

const NO_ROWS: GridWindow = Object.freeze({
	startIndex: 0,
	endIndex: 0,
	paddingTopPx: 0,
	paddingBottomPx: 0,
	hasRowsAbove: false,
	hasRowsBelow: false,
});
const UNSAMPLED_OFFSET_PX = Number.NEGATIVE_INFINITY;
const LAYOUT_UNITS_PER_PX = 64;

type TrackedGrid = { element: HTMLElement; count: number };
type ReadingPosition = { key: string; index: number; fraction: number };

let lastMetrics: GridMetrics = NO_METRICS;

function readSectionGridMetrics(grid: HTMLElement): GridMetrics {
	const style = getComputedStyle(grid);
	const columns = style.gridTemplateColumns.trim().split(/\s+/).length;
	const columnGapPx = Number.parseFloat(style.columnGap) || 0;
	const averageTrackPx =
		(grid.getBoundingClientRect().width - (columns - 1) * columnGapPx) /
		columns;
	return {
		columns,
		cellPx:
			Math.ceil(averageTrackPx * LAYOUT_UNITS_PER_PX) /
			LAYOUT_UNITS_PER_PX,
		gapPx: Number.parseFloat(style.rowGap) || 0,
	};
}

export function sectionView({
	windows,
	key,
	count,
}: {
	windows: () => SectionWindows;
	key: () => string;
	count: () => number;
}): GridWindow {
	const current = $derived(
		windows().windowOf({ key: key(), count: count() }),
	);
	return perFieldWindow(() => current);
}

export class SectionWindows {
	#grids = new SvelteMap<string, TrackedGrid>();
	#offsets = new SvelteMap<string, number>();
	#columns = $state(lastMetrics.columns);
	#cellPx = $state(lastMetrics.cellPx);
	#gapPx = $state(lastMetrics.gapPx);
	#viewportPx = $state(0);
	#windowed = $state(true);
	#scroller: Element | null = null;

	constructor() {
		$effect(() => {
			const [first] = this.#grids.values();
			if (first) return this.#follow(first.element);
		});
	}

	track({
		key,
		count,
	}: {
		key: string;
		count: number;
	}): Attachment<HTMLElement> {
		return (element) => {
			this.#grids.set(key, { element, count });
			return () => {
				if (this.#grids.get(key)?.element !== element) return;
				this.#grids.delete(key);
				this.#offsets.delete(key);
			};
		};
	}

	windowOf({ key, count }: { key: string; count: number }): GridWindow {
		if (!this.#windowed) return { ...NO_ROWS, endIndex: count };
		if (this.#cellPx <= 0) return NO_ROWS;
		return gridWindow({
			count,
			metrics: {
				columns: this.#columns,
				cellPx: this.#cellPx,
				gapPx: this.#gapPx,
			},
			offsetPx: this.#offsets.get(key) ?? UNSAMPLED_OFFSET_PX,
			viewportPx: this.#viewportPx,
			overscanPx: OVERSCAN_PX,
		});
	}

	#follow(grid: HTMLElement): () => void {
		const scroller = nearestScrollableAncestor(grid);
		this.#windowed = scroller !== null;
		if (!scroller) return () => {};

		this.#scroller = scroller;
		const sample = () => this.#sample();
		const resize = new ResizeObserver(() => this.#remeasure(grid));
		resize.observe(scroller);
		scroller.addEventListener("scroll", sample, { passive: true });

		return () => {
			resize.disconnect();
			scroller.removeEventListener("scroll", sample);
			this.#scroller = null;
		};
	}

	#remeasure(grid: HTMLElement) {
		const metrics = (lastMetrics = readSectionGridMetrics(grid));
		if (
			metrics.columns !== this.#columns ||
			metrics.cellPx !== this.#cellPx ||
			metrics.gapPx !== this.#gapPx
		) {
			const position = this.#readingPosition();
			this.#columns = metrics.columns;
			this.#cellPx = metrics.cellPx;
			this.#gapPx = metrics.gapPx;
			flushSync();
			if (position) this.#restore(position);
		}
		this.#sample();
	}

	#readingPosition(): ReadingPosition | null {
		if (this.#columns < 1 || this.#cellPx <= 0) return null;
		const stridePx = this.#cellPx + this.#gapPx;
		for (const [key, offsetPx] of this.#offsets) {
			const rows = Math.ceil(
				(this.#grids.get(key)?.count ?? 0) / this.#columns,
			);
			if (offsetPx < 0 || offsetPx >= rows * stridePx - this.#gapPx)
				continue;
			const row = Math.floor(offsetPx / stridePx);
			return {
				key,
				index: row * this.#columns,
				fraction: offsetPx / stridePx - row,
			};
		}
		return null;
	}

	#restore({ key, index, fraction }: ReadingPosition) {
		const scroller = this.#scroller;
		const grid = this.#grids.get(key)?.element;
		if (!scroller || !grid) return;
		const anchorPx =
			(Math.floor(index / this.#columns) + fraction) *
			(this.#cellPx + this.#gapPx);
		scroller.scrollTop +=
			grid.getBoundingClientRect().top +
			anchorPx -
			scroller.getBoundingClientRect().top;
	}

	#sample() {
		const scroller = this.#scroller;
		if (!scroller) return;
		const view = scroller.getBoundingClientRect();
		this.#viewportPx = view.height;
		for (const [key, { element }] of this.#grids)
			this.#offsets.set(
				key,
				view.top - element.getBoundingClientRect().top,
			);
	}
}
