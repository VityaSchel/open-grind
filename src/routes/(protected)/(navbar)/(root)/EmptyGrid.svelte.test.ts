// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	defaultFilters,
	type GridSearchFilters,
} from "$lib/model/browse/grid/filters";
import EmptyGrid from "./EmptyGrid.svelte";

const fakeGrid = vi.hoisted(() => ({
	filters: {
		value: null as GridSearchFilters | null,
		resetFilters: () => {},
	},
}));

vi.mock("$lib/grid/grid-state.svelte", () => ({ gridState: fakeGrid }));

const variants = [
	{
		name: "no favorites filter",
		filters: { isOnline: true },
		text: " No Profiles Found Try adjusting your filters or reset them to defaults. Reset filters",
	},
	{
		name: "favorites with other filters",
		filters: { isFavorite: true, isOnline: true },
		text: " No Results No favorites match these filters. Reset filters",
	},
	{
		name: "favorites alone",
		filters: { isFavorite: true },
		text: " No Favorites Yet Tap the star on someone's profile to save them here. Reset filters",
	},
] satisfies {
	name: string;
	filters: Partial<GridSearchFilters>;
	text: string;
}[];

function renderWith(filters: Partial<GridSearchFilters>) {
	fakeGrid.filters.value = { ...defaultFilters, ...filters };
	return render(EmptyGrid);
}

afterEach(async () => {
	cleanup();
	fakeGrid.filters.value = null;
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("EmptyGrid", () => {
	it.each(variants)(
		"explains the empty grid for $name",
		({ filters, text }) => {
			const { container } = renderWith(filters);

			expect(container.textContent).toBe(text);
		},
	);

	it.each(variants)(
		"words the empty grid for $name in the active locale",
		async ({ filters }) => {
			renderWith(filters);

			await setLocale({ locale: "en-XA" });

			for (const name of ["empty-title", "empty-description", "button"])
				expect(slot(name).textContent).toMatch(PSEUDO_MESSAGE);
		},
	);
});
