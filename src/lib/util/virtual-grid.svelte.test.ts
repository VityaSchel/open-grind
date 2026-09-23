import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { readGridMetrics, virtualGrid } from "./virtual-grid.svelte";

const COUNT = 1000;

function measuredGrid(): HTMLElement {
	const scroller = document.createElement("div");
	const grid = document.createElement("div");
	scroller.style.overflowY = "auto";
	grid.style.gridTemplateColumns = "128px 128px 128px";
	grid.style.rowGap = "2px";
	scroller.append(grid);
	document.body.append(scroller);
	return grid;
}

function mountedWindowEnd(grid: HTMLElement | null): number {
	let endIndex = Number.NaN;
	const stop = $effect.root(() => {
		endIndex = virtualGrid({
			grid: () => grid,
			count: () => COUNT,
		}).endIndex;
	});
	flushSync();
	stop();
	return endIndex;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("virtualGrid", () => {
	it("seeds a remount's first render from the last measured grid", () => {
		mountedWindowEnd(measuredGrid());

		expect(mountedWindowEnd(null)).toBeLessThan(COUNT);
	});

	it("does not reseed a remount from a plain metrics read", () => {
		mountedWindowEnd(measuredGrid());

		expect(readGridMetrics(document.createElement("div")).cellPx).toBe(0);
		expect(mountedWindowEnd(null)).toBeLessThan(COUNT);
	});
});
