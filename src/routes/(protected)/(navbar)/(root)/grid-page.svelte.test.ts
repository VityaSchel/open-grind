import { cleanup, render } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { revealedGridScrollTop } from "$lib/grid/grid-reveal";
import type { GridProfile } from "$lib/grid/grid";
import GridPage from "./+page.svelte";

const REVEALED_ID = 8;
const REVEALED_INDEX = 61;
const SAVED_TOP = 400;

class FakeGridState {
	loading = $state(true);
	error: Error | null = null;
	refreshing = false;
	loadingMore = false;
	nextPage: number | null = null;
	profiles: GridProfile[] = [];
	viewActive = false;
	scrollY = SAVED_TOP;
	revealProfileId: number | null = REVEALED_ID;

	load() {}

	consumeReveal(): number | null {
		const profileId = this.revealProfileId;
		this.revealProfileId = null;
		return profileId;
	}

	indexInProfiles(profileId: number): number {
		return profileId === REVEALED_ID ? REVEALED_INDEX : -1;
	}
}

let fakeGrid = new FakeGridState();

vi.mock("$lib/grid/grid-state.svelte", () => ({
	get gridState() {
		return fakeGrid;
	},
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	hydratePreferences: () => Promise.resolve(),
	preferencesSnapshot: () => ({ geohash: "u33dbc" }),
}));
vi.mock("./top-bar/TopBar.svelte", () => ({ default: () => {} }));
vi.mock("./LocationEmpty.svelte", () => ({ default: () => {} }));
vi.mock("./EmptyGrid.svelte", () => ({ default: () => {} }));
vi.mock("./GridProfileMiniCard.svelte", () => ({ default: () => {} }));
vi.mock("$lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));

async function mountedGrid() {
	render(GridPage);
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-slot="grid-cells"]'),
		).not.toBeNull();
	});
	const content = document.querySelector<HTMLElement>(
		'[data-slot="grid-content"]',
	);
	const grid = document.querySelector<HTMLElement>(
		'[data-slot="grid-cells"]',
	);
	const scroller = content?.parentElement;
	if (!content || !grid || !scroller)
		throw new Error("grid page not mounted");

	content.style.paddingTop = "76px";
	content.style.paddingBottom = "88px";
	grid.style.gridTemplateColumns = "128px 128px 128px";
	grid.style.rowGap = "2px";
	Object.defineProperties(scroller, {
		clientHeight: { value: 800 },
		scrollHeight: { value: 20_000 },
	});
	vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
		top: 0,
	} as DOMRect);
	vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
		top: 116,
	} as DOMRect);
	return scroller;
}

async function loaded() {
	fakeGrid.loading = false;
	flushSync();
	await tick();
}

describe("the grid page", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		fakeGrid = new FakeGridState();
	});

	it("reveals the profile handed back to the grid, by its index in the shared order", async () => {
		const scroller = await mountedGrid();
		const revealedTop = revealedGridScrollTop({
			scroller,
			savedTop: SAVED_TOP,
			index: REVEALED_INDEX,
		});

		expect(revealedTop).not.toBe(SAVED_TOP);

		await loaded();

		expect(scroller.scrollTop).toBe(revealedTop);
		expect(fakeGrid.revealProfileId).toBeNull();
	});

	it("restores the saved offset when no profile was handed back", async () => {
		fakeGrid.revealProfileId = null;
		const scroller = await mountedGrid();

		await loaded();

		expect(scroller.scrollTop).toBe(SAVED_TOP);
	});
});
