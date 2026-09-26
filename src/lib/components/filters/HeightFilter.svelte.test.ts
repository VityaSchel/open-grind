// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import { HEIGHT_CM_MIN } from "$lib/model/browse/grid/filters";
import { formatHeight } from "$lib/util/units";
import HeightFilter from "./HeightFilter.svelte";

const thumb = (name: string) => screen.getByRole("slider", { name });

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("HeightFilter", () => {
	it("announces each thumb in the units its label shows", () => {
		preferences.units = "imperial";
		render(HeightFilter, {
			props: { checked: true, value: [HEIGHT_CM_MIN, 180] },
		});

		expect(thumb("Minimum height").getAttribute("aria-valuetext")).toBe(
			"No min",
		);
		expect(thumb("Maximum height").getAttribute("aria-valuetext")).toBe(
			formatHeight(180, "imperial"),
		);
		expect(
			thumb("Maximum height").getAttribute("aria-valuetext"),
		).not.toMatch(/cm/);
	});
});
