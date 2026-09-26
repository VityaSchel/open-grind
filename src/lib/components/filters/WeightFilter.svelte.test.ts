// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import { formatWeightKg } from "$lib/util/units";
import WeightFilter from "./WeightFilter.svelte";

const TRACK_WIDTH = 1000;

const minimumWeight = () =>
	screen.getByRole("slider", { name: "Minimum weight" });

function renderFilter(value: number[]) {
	const { container } = render(WeightFilter, {
		props: { checked: true, value },
	});
	const slider = container.querySelector<HTMLElement>(
		'[data-slot="slider"]',
	)!;
	slider.getBoundingClientRect = () =>
		({ left: 0, right: TRACK_WIDTH, top: 0, bottom: 16 }) as DOMRect;
	return {
		track: container.querySelector<HTMLElement>(
			'[data-slot="slider-track"]',
		)!,
	};
}

const maximumWeight = () =>
	screen.getByRole("slider", { name: "Maximum weight" });

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("WeightFilter", () => {
	it("announces each thumb in the units its label shows", () => {
		preferences.units = "imperial";
		renderFilter([80, 272]);

		expect(minimumWeight().getAttribute("aria-valuetext")).toBe(
			formatWeightKg(80, "imperial"),
		);
		expect(minimumWeight().getAttribute("aria-valuetext")).toMatch(/lb/);
		expect(maximumWeight().getAttribute("aria-valuetext")).toBe("No max");
	});

	it("announces kilograms and moves one kilogram per arrow key", async () => {
		renderFilter([80, 272]);

		expect(minimumWeight().getAttribute("aria-valuenow")).toBe("80");
		expect(minimumWeight().getAttribute("aria-valuemin")).toBe("41");
		expect(minimumWeight().getAttribute("aria-valuemax")).toBe("272");

		await fireEvent.keyDown(minimumWeight(), { key: "ArrowRight" });

		expect(minimumWeight().getAttribute("aria-valuenow")).toBe("81");
		expect(screen.getByText("81 kg - No max")).toBeTruthy();
	});

	it("gives the common weights most of the track", async () => {
		const { track } = renderFilter([41, 272]);

		await fireEvent(
			track,
			new MouseEvent("pointerdown", {
				clientX: TRACK_WIDTH / 2,
				bubbles: true,
				cancelable: true,
			}),
		);

		expect(minimumWeight().getAttribute("aria-valuenow")).toBe("94");
		expect(screen.getByText("94 kg - No max")).toBeTruthy();
	});
});
