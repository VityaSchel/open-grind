// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPreferencesMock, setPreferencesMock } = vi.hoisted(() => ({
	getPreferencesMock: vi.fn(),
	setPreferencesMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: getPreferencesMock,
	setPreferences: setPreferencesMock,
}));

vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import {
	defaultRightNowFeedFilters,
	type RightNowFeedFilters,
} from "#lib/model/right-now/filters.ts";
import { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";
import HostingQuickFilter from "./HostingQuickFilter.svelte";

const saved: RightNowFeedFilters = {
	...defaultRightNowFeedFilters,
	sort: "DISTANCE",
};

async function openHostingFilter(stored: RightNowFeedFilters = saved) {
	getPreferencesMock.mockResolvedValue({ rightNowFeedFilters: stored });
	const onQueryChange = vi.fn();
	const filters = new RightNowFeedFiltersState({ onQueryChange });
	await filters.ready;
	const view = render(HostingQuickFilter, { props: { open: true, filters } });
	flushSync();
	return { filters, onQueryChange, rerender: view.rerender };
}

function checkedOption() {
	return screen
		.getAllByRole("radio")
		.filter((radio) => radio.getAttribute("aria-checked") === "true")
		.map((radio) => radio.textContent.trim());
}

function switchChecked() {
	return screen
		.getByRole("switch", { name: "Filter by hosting" })
		.getAttribute("aria-checked");
}

beforeEach(() => {
	getPreferencesMock.mockReset();
	setPreferencesMock.mockClear();
});

afterEach(() => {
	cleanup();
});

describe("HostingQuickFilter", () => {
	it("offers Hosting and Not hosting, each with an icon of its own", async () => {
		await openHostingFilter();

		const options = screen.getAllByRole("radio");
		expect(options.map((option) => option.textContent.trim())).toEqual([
			"Hosting",
			"Not hosting",
		]);
		const drawings = options.map(
			(option) => option.querySelector("svg")?.innerHTML,
		);
		expect(drawings).not.toContain(undefined);
		expect(new Set(drawings).size).toBe(drawings.length);
	});

	it("turns the filter on when Not hosting is picked, then applies and saves it", async () => {
		const { filters, onQueryChange } = await openHostingFilter();

		expect(switchChecked()).toBe("false");
		expect(checkedOption()).toEqual(["Hosting"]);

		await fireEvent.click(
			screen.getByRole("radio", { name: "Not hosting" }),
		);

		expect(switchChecked()).toBe("true");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		const applied: RightNowFeedFilters = {
			...saved,
			hostingEnabled: true,
			hosting: false,
		};
		expect(filters.value).toEqual(applied);
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			rightNowFeedFilters: applied,
		});
		expect(onQueryChange).toHaveBeenCalledOnce();
	});

	it("resets to Hosting and leaves the switch as it was", async () => {
		const { filters } = await openHostingFilter({
			...saved,
			hostingEnabled: true,
			hosting: false,
		});

		expect(checkedOption()).toEqual(["Not hosting"]);

		await fireEvent.click(screen.getByRole("button", { name: "Reset" }));

		expect(checkedOption()).toEqual(["Hosting"]);
		expect(switchChecked()).toBe("true");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(filters.value).toEqual({
			...saved,
			hostingEnabled: true,
			hosting: true,
		});
	});

	it("turns the filter off from the switch and keeps the picked option", async () => {
		const { filters } = await openHostingFilter({
			...saved,
			hostingEnabled: true,
			hosting: false,
		});

		await fireEvent.click(
			screen.getByRole("switch", { name: "Filter by hosting" }),
		);
		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(filters.value).toEqual({
			...saved,
			hostingEnabled: false,
			hosting: false,
		});
	});

	it("changes nothing when closed without Apply, and starts over from the saved filter", async () => {
		const { filters, onQueryChange, rerender } = await openHostingFilter();

		await fireEvent.click(
			screen.getByRole("radio", { name: "Not hosting" }),
		);
		expect(switchChecked()).toBe("true");

		await rerender({ open: false });

		expect(filters.value).toEqual(saved);
		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(onQueryChange).not.toHaveBeenCalled();

		await rerender({ open: true });

		expect(checkedOption()).toEqual(["Hosting"]);
		expect(switchChecked()).toBe("false");
	});
});
