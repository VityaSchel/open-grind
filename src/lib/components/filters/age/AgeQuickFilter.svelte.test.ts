// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setPreferencesMock } = vi.hoisted(() => ({
	setPreferencesMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: vi.fn(() => Promise.resolve({})),
	setPreferences: setPreferencesMock,
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import { GridSearchFiltersState } from "#lib/grid/grid-search-filters-state.svelte.ts";
import {
	AGE_MAX,
	AGE_MIN,
	defaultFilters,
} from "#lib/model/browse/grid/filters.ts";
import AgeQuickFilter from "./AgeQuickFilter.svelte";

async function openAgeFilter() {
	const onQueryChange = vi.fn();
	const filters = new GridSearchFiltersState({ onQueryChange });
	await filters.ready;
	const view = render(AgeQuickFilter, { props: { open: true, filters } });
	flushSync();
	return { filters, onQueryChange, rerender: view.rerender };
}

const minimumAge = () => screen.getByRole("slider", { name: "Minimum age" });

function switchChecked() {
	return screen
		.getByRole("switch", { name: "Filter by age" })
		.getAttribute("aria-checked");
}

beforeEach(() => {
	setPreferencesMock.mockClear();
});

afterEach(() => {
	cleanup();
});

describe("AgeQuickFilter", () => {
	it("keeps an in-progress edit when the stored filters change underneath", async () => {
		const { filters } = await openAgeFilter();

		expect(document.body.textContent).toContain("18 years & over");

		filters.set({ age: [30, 40] });
		flushSync();

		expect(document.body.textContent).toContain("18 years & over");
		expect(document.body.textContent).not.toContain("30 - 40");
	});

	it("keeps reset available at the default age range, where it changes nothing", async () => {
		const { filters } = await openAgeFilter();

		const reset = screen.getByRole("button", { name: "Reset" });

		expect(reset).toHaveProperty("disabled", false);

		await fireEvent.click(reset);

		expect(document.body.textContent).toContain("18 years & over");
		expect(switchChecked()).toBe("false");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(filters.snapshot()).toEqual(defaultFilters);
	});

	it("turns the filter on when the range moves, then applies and saves it", async () => {
		const { filters, onQueryChange } = await openAgeFilter();

		expect(switchChecked()).toBe("false");

		await fireEvent.keyDown(minimumAge(), { key: "ArrowRight" });
		const minimum = Number(minimumAge().getAttribute("aria-valuenow"));

		expect(minimum).toBeGreaterThan(AGE_MIN);
		expect(switchChecked()).toBe("true");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		const applied = {
			...defaultFilters,
			ageEnabled: true,
			age: [minimum, AGE_MAX],
		};
		expect(filters.value).toEqual(applied);
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			gridSearchFilters: applied,
		});
		expect(onQueryChange).toHaveBeenCalledOnce();
	});

	it("changes nothing when closed without Apply, and starts over from the saved range", async () => {
		const { filters, onQueryChange, rerender } = await openAgeFilter();

		await fireEvent.keyDown(minimumAge(), { key: "ArrowRight" });
		expect(switchChecked()).toBe("true");

		await rerender({ open: false });

		expect(filters.value).toEqual(defaultFilters);
		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(onQueryChange).not.toHaveBeenCalled();

		await rerender({ open: true });

		expect(minimumAge().getAttribute("aria-valuenow")).toBe(
			String(AGE_MIN),
		);
		expect(switchChecked()).toBe("false");
	});
});
