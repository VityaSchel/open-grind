// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rendered } from "#lib/grid/grid-test-helpers.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { GridProfile } from "#lib/grid/grid.ts";
import Grid from "./Grid.svelte";

class FakeGridState {
	loading = $state(false);
	error: Error | null = null;
	paging = $state({ running: false, failure: null, armToken: "" });
	nextPage: number | null = $state(null);
	profiles: GridProfile[] = $state([]);
	revealProfileId: number | null = null;
	keyboardStop: number | null = null;

	load() {}

	attachView(): () => void {
		return () => {};
	}

	resolveProfile(): Promise<void> {
		return Promise.resolve();
	}
}

let fakeGrid = new FakeGridState();

const { miniCard } = vi.hoisted(() => ({ miniCard: vi.fn() }));

vi.mock("#lib/grid/grid-state.svelte.ts", () => ({
	get gridState() {
		return fakeGrid;
	},
}));
vi.mock("./GridProfileMiniCard.svelte", () => ({ default: miniCard }));
vi.mock("./EmptyGrid.svelte", () => ({ default: () => {} }));
vi.mock("#lib/components/shared/PagingSentinel.svelte", () => ({
	default: () => {},
}));

let columns: HTMLStyleElement;

beforeEach(() => {
	runningOn("linux");
	columns = document.head.appendChild(document.createElement("style"));
	columns.textContent =
		'[data-slot="grid-cells"] { grid-template-columns: 1px 1px 1px; }';
});

afterEach(() => {
	cleanup();
	columns.remove();
	fakeGrid = new FakeGridState();
	resetPlatform();
});

async function mountGrid({
	count,
	nextPage = null,
}: {
	count: number;
	nextPage?: number | null;
}) {
	fakeGrid.profiles = Array.from({ length: count }, (_, id) =>
		rendered({ id }),
	);
	fakeGrid.nextPage = nextPage;
	render(Grid, { props: { geohash: "u33dbc" } });
	await tick();
	await tick();
	return screen.getByRole("grid", { name: "Browse" });
}

describe("the browse grid", () => {
	it("groups its cards into rows of as many cells as the grid draws columns", async () => {
		const grid = await mountGrid({ count: 7 });

		const rows = within(grid).getAllByRole("row");
		expect(
			rows.map((row) => within(row).getAllByRole("gridcell").length),
		).toEqual([3, 3, 1]);
		expect(rows.map((row) => row.getAttribute("aria-rowindex"))).toEqual([
			"1",
			"2",
			"3",
		]);
	});

	it("counts its rows once every page is loaded", async () => {
		const grid = await mountGrid({ count: 7 });

		expect(grid.getAttribute("aria-rowcount")).toBe("3");
	});

	it("leaves the row count open while more pages can load", async () => {
		const grid = await mountGrid({ count: 7, nextPage: 2 });

		expect(grid.getAttribute("aria-rowcount")).toBe("-1");
	});

	it("draws each card once when it mounts again, in rows of the columns it drew last", async () => {
		await mountGrid({ count: 7 });
		cleanup();
		miniCard.mockClear();

		const grid = await mountGrid({ count: 7 });

		expect(miniCard).toHaveBeenCalledTimes(7);
		expect(
			within(grid)
				.getAllByRole("row")
				.map((row) => within(row).getAllByRole("gridcell").length),
		).toEqual([3, 3, 1]);
	});

	it("keeps loading placeholders out of the rows", async () => {
		fakeGrid.paging.running = true;
		const grid = await mountGrid({ count: 4, nextPage: 2 });

		expect(
			within(grid)
				.getAllByRole("row")
				.map((row) => within(row).getAllByRole("gridcell").length),
		).toEqual([3, 1]);
	});
});
