import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { virtualGrid } from "$lib/util/virtual-grid.svelte";
import type { GridWindow } from "$lib/util/grid-window";
import { sectionView, SectionWindows } from "./section-windows.svelte";

const COLUMNS = 3;
const CELL_PX = 100;
const GAP_PX = 4;
const ROW_STRIDE = CELL_PX + GAP_PX;
const GRID_WIDTH = COLUMNS * CELL_PX + (COLUMNS - 1) * GAP_PX;
const VIEWPORT_PX = 700;
const NARROW_COLUMNS = 2;
const NARROW_CELL_PX = (GRID_WIDTH - (NARROW_COLUMNS - 1) * GAP_PX) / 2;
const NARROW_ROW_STRIDE = NARROW_CELL_PX + GAP_PX;

type Placement = { top: number; width: number };

function stubRect(element: Element, rect: () => Partial<DOMRect>) {
	element.getBoundingClientRect = () =>
		({ top: 0, left: 0, width: 0, height: 0, ...rect() }) as DOMRect;
}

function container({ scrolls }: { scrolls: boolean }): HTMLElement {
	const element = document.createElement("div");
	if (scrolls) element.style.overflowY = "auto";
	stubRect(element, () => ({ top: 0, height: VIEWPORT_PX }));
	document.body.append(element);
	return element;
}

function setColumns(grid: HTMLElement, { columns }: { columns: number }) {
	grid.style.gridTemplateColumns = Array.from(
		{ length: columns },
		() => "1fr",
	).join(" ");
}

function sectionGrid({ parent, top }: { parent: HTMLElement; top: number }): {
	grid: HTMLElement;
	placement: Placement;
} {
	const grid = document.createElement("div");
	setColumns(grid, { columns: COLUMNS });
	grid.style.columnGap = `${GAP_PX}px`;
	grid.style.rowGap = `${GAP_PX}px`;
	parent.append(grid);
	const placement: Placement = { top, width: GRID_WIDTH };
	stubRect(grid, () => placement);
	return { grid, placement };
}

function fullHeight(count: number): number {
	return Math.ceil(count / COLUMNS) * ROW_STRIDE - GAP_PX;
}

function mountWindows(sections: { key: string; count: number }[]) {
	const views = new Map<string, GridWindow>();
	const counts = new Map(sections.map(({ key, count }) => [key, count]));
	let windows!: SectionWindows;
	const stop = $effect.root(() => {
		windows = new SectionWindows();
		for (const { key, count } of sections) {
			views.set(
				key,
				sectionView({
					windows: () => windows,
					key: () => key,
					count: () => count,
				}),
			);
		}
	});
	const view = (key: string) => views.get(key)!;
	const track = ({ key, grid }: { key: string; grid: HTMLElement }) =>
		windows.track({ key, count: counts.get(key)! })(grid);
	return { windows, view, track, stop };
}

let resizeCallbacks: (() => void)[];

function observeResize() {
	for (const callback of resizeCallbacks) callback();
	flushSync();
}

beforeEach(() => {
	resizeCallbacks = [];
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resizeCallbacks.push(callback);
			}
			observe() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe("SectionWindows", () => {
	it("renders no tiles until its scroller's first resize observation samples it", () => {
		const scroller = container({ scrolls: true });
		const { grid } = sectionGrid({ parent: scroller, top: 0 });
		const { view, track, stop } = mountWindows([
			{ key: "body", count: 60 },
		]);
		expect(view("body").endIndex).toBe(0);

		track({ key: "body", grid });
		flushSync();
		expect(view("body").endIndex).toBe(0);

		observeResize();
		expect(view("body").endIndex).toBeGreaterThan(0);
		stop();
	});

	it("renders every tile without a scrolling ancestor to sample", () => {
		const parent = container({ scrolls: false });
		const { grid } = sectionGrid({ parent, top: 0 });
		const { view, track, stop } = mountWindows([
			{ key: "body", count: 60 },
		]);

		track({ key: "body", grid });
		flushSync();

		expect(view("body")).toMatchObject({
			startIndex: 0,
			endIndex: 60,
			paddingTopPx: 0,
			paddingBottomPx: 0,
		});
		stop();
	});

	it("windows each section against its own place in the scroller", () => {
		const scroller = container({ scrolls: true });
		const current = sectionGrid({ parent: scroller, top: -3000 });
		const below = sectionGrid({ parent: scroller, top: 10_000 });
		const { view, track, stop } = mountWindows([
			{ key: "current", count: 300 },
			{ key: "below", count: 30 },
		]);

		track({ key: "current", grid: current.grid });
		track({ key: "below", grid: below.grid });
		flushSync();
		observeResize();

		expect(view("current")).toMatchObject({
			startIndex: 23 * COLUMNS,
			endIndex: 42 * COLUMNS,
			paddingTopPx: 23 * ROW_STRIDE,
			paddingBottomPx: (100 - 42) * ROW_STRIDE,
		});
		expect(view("below")).toMatchObject({
			startIndex: 0,
			endIndex: 0,
			paddingTopPx: 0,
			paddingBottomPx: fullHeight(30),
		});
		stop();
	});

	it("rounds a cell up to the next layout unit, as the widest of the browser's tracks", () => {
		const scroller = container({ scrolls: true });
		const below = sectionGrid({ parent: scroller, top: 10_000 });
		below.placement.width = GRID_WIDTH + 1;
		const { view, track, stop } = mountWindows([
			{ key: "below", count: 30 },
		]);

		track({ key: "below", grid: below.grid });
		flushSync();
		observeResize();

		const cellPx = Math.ceil((CELL_PX + 1 / COLUMNS) * 64) / 64;
		expect(view("below").paddingBottomPx).toBe(
			(30 / COLUMNS) * (cellPx + GAP_PX) - GAP_PX,
		);
		stop();
	});

	it("samples again on scroll", () => {
		const scroller = container({ scrolls: true });
		const below = sectionGrid({ parent: scroller, top: 10_000 });
		const { view, track, stop } = mountWindows([
			{ key: "below", count: 30 },
		]);
		track({ key: "below", grid: below.grid });
		flushSync();
		observeResize();
		expect(view("below").endIndex).toBe(0);

		below.placement.top = 200;
		scroller.dispatchEvent(new Event("scroll"));
		flushSync();

		expect(view("below").endIndex).toBe(30);
		stop();
	});

	it("samples again once new metrics have been laid out", () => {
		const scroller = container({ scrolls: true });
		const above = sectionGrid({ parent: scroller, top: -1000 });
		const below = sectionGrid({ parent: scroller, top: 3000 });
		const { view, track, stop } = mountWindows([
			{ key: "above", count: 30 },
			{ key: "below", count: 30 },
		]);
		track({ key: "above", grid: above.grid });
		track({ key: "below", grid: below.grid });
		flushSync();
		observeResize();
		expect(view("below").endIndex).toBe(0);

		const narrowWidth = GRID_WIDTH / 2;
		above.placement.width = narrowWidth;
		below.placement.width = narrowWidth;
		below.placement.top = 600;
		observeResize();

		expect(view("below")).toMatchObject({
			endIndex: 30,
			paddingBottomPx: 0,
		});
		stop();
	});

	it("keeps the Gaymoji at the top of the view there, on its new row, when the columns change", () => {
		const scroller = container({ scrolls: true });
		const above = sectionGrid({ parent: scroller, top: -3600 });
		const current = sectionGrid({
			parent: scroller,
			top: -23.5 * ROW_STRIDE,
		});
		const { track, stop } = mountWindows([
			{ key: "above", count: 30 },
			{ key: "current", count: 300 },
		]);
		track({ key: "above", grid: above.grid });
		track({ key: "current", grid: current.grid });
		flushSync();
		observeResize();
		expect(scroller.scrollTop).toBe(0);

		const anchoredRow = Math.floor((23 * COLUMNS) / NARROW_COLUMNS);
		const laidOutTop = current.placement.top + 1300;
		for (const { grid } of [above, current])
			setColumns(grid, { columns: NARROW_COLUMNS });
		current.placement.top = laidOutTop;
		observeResize();

		expect(scroller.scrollTop).toBe(
			laidOutTop + (anchoredRow + 0.5) * NARROW_ROW_STRIDE,
		);
		stop();
	});

	it.each([
		{
			at: "in a section's title",
			above: -fullHeight(30) - 30,
			current: 34,
		},
		{ at: "above the first section", above: 300, current: 1400 },
	])(
		"leaves the scroll position alone when the top of the view is $at",
		({ above, current }) => {
			const scroller = container({ scrolls: true });
			const grids = {
				above: sectionGrid({ parent: scroller, top: above }),
				current: sectionGrid({ parent: scroller, top: current }),
			};
			const { track, stop } = mountWindows([
				{ key: "above", count: 30 },
				{ key: "current", count: 300 },
			]);
			track({ key: "above", grid: grids.above.grid });
			track({ key: "current", grid: grids.current.grid });
			flushSync();
			observeResize();

			for (const { grid } of Object.values(grids))
				setColumns(grid, { columns: NARROW_COLUMNS });
			observeResize();

			expect(scroller.scrollTop).toBe(0);
			stop();
		},
	);

	it("leaves a section's window untouched by a scroll that does not move it", () => {
		const scroller = container({ scrolls: true });
		const current = sectionGrid({ parent: scroller, top: -3000 });
		const { view, track, stop } = mountWindows([
			{ key: "current", count: 300 },
		]);
		track({ key: "current", grid: current.grid });
		flushSync();
		observeResize();
		let reads = 0;
		const stopReading = $effect.root(() => {
			$effect(() => {
				void view("current").startIndex;
				void view("current").endIndex;
				void view("current").paddingTopPx;
				void view("current").paddingBottomPx;
				reads += 1;
			});
		});
		flushSync();
		const settled = reads;

		current.placement.top = -3010;
		scroller.dispatchEvent(new Event("scroll"));
		flushSync();
		expect(reads).toBe(settled);

		current.placement.top = -3000 - 5 * ROW_STRIDE;
		scroller.dispatchEvent(new Event("scroll"));
		flushSync();
		expect(reads).toBeGreaterThan(settled);
		stopReading();
		stop();
	});

	it("seeds a remount with the last measured metrics, padding unsampled sections to their full height", () => {
		const scroller = container({ scrolls: true });
		const below = sectionGrid({ parent: scroller, top: 10_000 });
		const first = mountWindows([{ key: "below", count: 30 }]);
		first.track({ key: "below", grid: below.grid });
		flushSync();
		observeResize();
		first.stop();

		const remount = mountWindows([{ key: "below", count: 30 }]);

		expect(remount.view("below")).toMatchObject({
			endIndex: 0,
			paddingTopPx: 0,
			paddingBottomPx: fullHeight(30),
		});
		remount.stop();
	});

	it("keeps its measurements away from the browse grid's remount seed", () => {
		const scroller = container({ scrolls: true });
		const { grid } = sectionGrid({ parent: scroller, top: 0 });
		const { track, stop } = mountWindows([{ key: "body", count: 60 }]);
		track({ key: "body", grid });
		flushSync();
		observeResize();
		stop();

		let browseEnd = Number.NaN;
		const stopBrowse = $effect.root(() => {
			browseEnd = virtualGrid({
				grid: () => null,
				count: () => 1000,
			}).endIndex;
		});
		flushSync();
		stopBrowse();

		expect(browseEnd).toBe(1000);
	});
});
