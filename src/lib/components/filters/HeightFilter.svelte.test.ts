// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));

import { HEIGHT_CM_MAX, HEIGHT_CM_MIN } from "$lib/model/browse/grid/filters";
import { formatHeight } from "$lib/util/units";
import HeightFilter from "./HeightFilter.svelte";

const thumb = (name: string) => screen.getByRole("slider", { name });
const valueText = (name: string) => thumb(name).getAttribute("aria-valuetext");

function renderFilter(height: number[]) {
	const stored = $state({ height });
	render(HeightFilter, {
		props: {
			checked: true,
			get value() {
				return stored.height;
			},
			set value(next: number[]) {
				stored.height = next;
			},
		},
	});
	return stored;
}

async function press({ name, key }: { name: string; key: string }) {
	await fireEvent.keyDown(thumb(name), { key });
	return valueText(name);
}

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("HeightFilter", () => {
	it("announces each thumb in the units its label shows", () => {
		preferences.units = "imperial";
		renderFilter([HEIGHT_CM_MIN, 180]);

		expect(valueText("Minimum height")).toBe("No min");
		expect(valueText("Maximum height")).toBe(formatHeight(180, "imperial"));
		expect(valueText("Maximum height")).not.toMatch(/cm/);
	});

	it("moves one centimetre per arrow key in metric units", async () => {
		const stored = renderFilter([170, HEIGHT_CM_MAX]);

		await press({ name: "Minimum height", key: "ArrowRight" });

		expect(stored.height).toEqual([171, HEIGHT_CM_MAX]);
		expect(thumb("Minimum height").getAttribute("aria-valuenow")).toBe(
			"171",
		);
		expect(screen.getByText("171 cm - No max")).toBeTruthy();
	});
});

describe("HeightFilter in imperial units", () => {
	it("moves one whole inch per arrow key, never repeating a label", async () => {
		preferences.units = "imperial";
		renderFilter([170, HEIGHT_CM_MAX]);
		expect(valueText("Minimum height")).toBe("5'7\"");

		const labels = [];
		for (let presses = 0; presses < 5; presses++)
			labels.push(
				await press({ name: "Minimum height", key: "ArrowRight" }),
			);

		expect(labels).toEqual(["5'8\"", "5'9\"", "5'10\"", "5'11\"", "6'0\""]);
		expect(screen.getByText("6'0\" - No max")).toBeTruthy();
	});

	it("counts the thumbs in inches", () => {
		preferences.units = "imperial";
		renderFilter([170, 183]);

		expect(thumb("Minimum height").getAttribute("aria-valuemin")).toBe(
			"48",
		);
		expect(thumb("Minimum height").getAttribute("aria-valuemax")).toBe(
			"95",
		);
		expect(thumb("Minimum height").getAttribute("aria-valuenow")).toBe(
			"67",
		);
		expect(thumb("Maximum height").getAttribute("aria-valuenow")).toBe(
			"72",
		);
	});

	it("stores the centimetres of the inch a thumb lands on", async () => {
		preferences.units = "imperial";
		const stored = renderFilter([170, HEIGHT_CM_MAX]);

		await press({ name: "Minimum height", key: "ArrowRight" });

		expect(stored.height).toEqual([173, HEIGHT_CM_MAX]);
	});

	it("keeps a height between two inches until its own thumb moves", async () => {
		preferences.units = "imperial";
		const stored = renderFilter([170, 176]);

		await press({ name: "Minimum height", key: "ArrowLeft" });
		expect(stored.height).toEqual([168, 176]);

		await press({ name: "Maximum height", key: "ArrowRight" });
		expect(stored.height).toEqual([168, 178]);
	});

	it("leaves heights that sit between two inches as stored when it opens", async () => {
		preferences.units = "imperial";
		const stored = renderFilter([171, 176]);

		await tick();

		expect(valueText("Minimum height")).toBe("5'7\"");
		expect(valueText("Maximum height")).toBe("5'9\"");
		expect(stored.height).toEqual([171, 176]);
	});

	it("drops a bound once its thumb reaches the end of the track", async () => {
		preferences.units = "imperial";
		const stored = renderFilter([124, 239]);

		expect(await press({ name: "Minimum height", key: "ArrowLeft" })).toBe(
			"No min",
		);
		expect(await press({ name: "Maximum height", key: "ArrowRight" })).toBe(
			"No max",
		);
		expect(stored.height).toEqual([HEIGHT_CM_MIN, HEIGHT_CM_MAX]);
	});

	it("drops a bound stored a centimetre above the shortest height", async () => {
		preferences.units = "imperial";
		const stored = renderFilter([122, HEIGHT_CM_MAX]);
		expect(valueText("Minimum height")).toBe("4'0\"");

		expect(await press({ name: "Minimum height", key: "ArrowLeft" })).toBe(
			"No min",
		);
		expect(stored.height).toEqual([HEIGHT_CM_MIN, HEIGHT_CM_MAX]);
	});
});
