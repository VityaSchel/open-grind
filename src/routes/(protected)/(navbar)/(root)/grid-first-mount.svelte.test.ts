// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { rendered } from "#lib/grid/grid-test-helpers.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { GridProfile } from "#lib/grid/grid.ts";
import Grid from "./Grid.svelte";

const { miniCard, fakeGrid } = vi.hoisted(() => ({
	miniCard: vi.fn(),
	fakeGrid: {
		loading: false,
		error: null,
		paging: { running: false, failure: null, armToken: "" },
		nextPage: null,
		profiles: [] as GridProfile[],
		revealProfileId: null,
		keyboardStop: null,
		load: () => {},
		attachView: () => () => {},
		resolveProfile: () => Promise.resolve(),
	},
}));

vi.mock("#lib/grid/grid-state.svelte.ts", () => ({ gridState: fakeGrid }));
vi.mock("./GridProfileMiniCard.svelte", () => ({ default: miniCard }));
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
	resetPlatform();
});

it("draws each card once on the first mount of the session, in rows of the columns it measures", async () => {
	fakeGrid.profiles = Array.from({ length: 7 }, (_, id) => rendered({ id }));

	render(Grid, { props: { geohash: "u33dbc" } });
	await tick();
	await tick();

	expect(miniCard).toHaveBeenCalledTimes(7);
	expect(
		within(screen.getByRole("grid", { name: "Browse" }))
			.getAllByRole("row")
			.map((row) => within(row).getAllByRole("gridcell").length),
	).toEqual([3, 3, 1]);
});
