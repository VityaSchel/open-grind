// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import { formatWeightKg, kgToPounds } from "$lib/util/units";
import WeightFilter from "./WeightFilter.svelte";

const TRACK_WIDTH = 1000;

const minimumWeight = () =>
	screen.getByRole("slider", { name: "Minimum weight" });

function renderFilter(weight: number[]) {
	const stored = $state({ weight });
	const { container } = render(WeightFilter, {
		props: {
			checked: true,
			get value() {
				return stored.weight;
			},
			set value(next: number[]) {
				stored.weight = next;
			},
		},
	});
	const slider = container.querySelector<HTMLElement>(
		'[data-slot="slider"]',
	)!;
	slider.getBoundingClientRect = () =>
		({ left: 0, right: TRACK_WIDTH, top: 0, bottom: 16 }) as DOMRect;
	return {
		stored,
		track: container.querySelector<HTMLElement>(
			'[data-slot="slider-track"]',
		)!,
	};
}

function pressTrackMiddle(track: HTMLElement) {
	return fireEvent(
		track,
		new MouseEvent("pointerdown", {
			clientX: TRACK_WIDTH / 2,
			bubbles: true,
			cancelable: true,
		}),
	);
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

		await pressTrackMiddle(track);

		expect(minimumWeight().getAttribute("aria-valuenow")).toBe("94");
		expect(screen.getByText("94 kg - No max")).toBeTruthy();
	});

	it("keeps a weight picked in pounds while the other thumb moves in kilograms", async () => {
		const { stored } = renderFilter([79.8, 100]);

		await fireEvent.keyDown(maximumWeight(), { key: "ArrowRight" });

		expect(stored.weight).toEqual([79.8, 101]);
	});

	it("drops bounds picked in pounds just inside the limits", async () => {
		const { stored } = renderFilter([41.3, 271.7]);

		await fireEvent.keyDown(minimumWeight(), { key: "ArrowLeft" });
		await fireEvent.keyDown(maximumWeight(), { key: "ArrowRight" });

		expect(stored.weight).toEqual([41, 272]);
		expect(screen.getByText("No min - No max")).toBeTruthy();
	});
});

describe("WeightFilter in imperial units", () => {
	it("moves one whole pound per arrow key, never skipping one", async () => {
		preferences.units = "imperial";
		renderFilter([80, 272]);
		expect(minimumWeight().getAttribute("aria-valuetext")).toBe("176 lb");

		const labels = [];
		for (let presses = 0; presses < 3; presses++) {
			await fireEvent.keyDown(minimumWeight(), { key: "ArrowRight" });
			labels.push(minimumWeight().getAttribute("aria-valuetext"));
		}

		expect(labels).toEqual(["177 lb", "178 lb", "179 lb"]);
		expect(screen.getByText("179 lb - No max")).toBeTruthy();
	});

	it("counts the thumbs in pounds", () => {
		preferences.units = "imperial";
		renderFilter([80, 272]);

		expect(minimumWeight().getAttribute("aria-valuemin")).toBe("90");
		expect(minimumWeight().getAttribute("aria-valuemax")).toBe("600");
		expect(minimumWeight().getAttribute("aria-valuenow")).toBe("176");
		expect(maximumWeight().getAttribute("aria-valuenow")).toBe("600");
	});

	it("stores the kilograms of the pound a thumb lands on", async () => {
		preferences.units = "imperial";
		const { stored } = renderFilter([80, 272]);

		await fireEvent.keyDown(minimumWeight(), { key: "ArrowRight" });

		expect(stored.weight).toEqual([80.3, 272]);
	});

	it("keeps a weight between two pounds until its own thumb moves", async () => {
		preferences.units = "imperial";
		const { stored } = renderFilter([80, 100]);

		await fireEvent.keyDown(minimumWeight(), { key: "ArrowLeft" });
		expect(stored.weight).toEqual([79.4, 100]);

		await fireEvent.keyDown(maximumWeight(), { key: "ArrowRight" });
		expect(stored.weight).toEqual([79.4, 100.2]);
	});

	it("drops a bound once its thumb reaches the end of the track", async () => {
		preferences.units = "imperial";
		const { stored } = renderFilter([80, 200]);

		await fireEvent.keyDown(minimumWeight(), { key: "Home" });
		await fireEvent.keyDown(maximumWeight(), { key: "End" });

		expect(stored.weight).toEqual([41, 272]);
		expect(screen.getByText("No min - No max")).toBeTruthy();
	});

	it("keeps each weight where the kilogram track has it", async () => {
		preferences.units = "imperial";
		const { track } = renderFilter([41, 272]);

		await pressTrackMiddle(track);

		const pounds = Number(minimumWeight().getAttribute("aria-valuenow"));
		expect(Math.abs(pounds - kgToPounds(94))).toBeLessThanOrEqual(1);
	});
});
