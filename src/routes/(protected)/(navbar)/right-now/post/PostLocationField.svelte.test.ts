// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	preferencesSnapshot: () => preferences,
}));

import type { PostForm } from "./post-form";
import PostLocationField from "./PostLocationField.svelte";

const mapSwitch = () => screen.getByRole("switch", { name: "Show me on map" });
const accuracy = () =>
	screen.queryByRole("slider", { name: "Location accuracy" });

function renderField({
	shareLocation = "NONE",
	locationRadius = 0,
}: {
	shareLocation?: PostForm["shareLocation"];
	locationRadius?: number;
} = {}) {
	const stored = $state({ shareLocation, locationRadius });
	render(PostLocationField, {
		props: {
			get shareLocation() {
				return stored.shareLocation;
			},
			set shareLocation(next: PostForm["shareLocation"]) {
				stored.shareLocation = next;
			},
			get locationRadius() {
				return stored.locationRadius;
			},
			set locationRadius(next: number) {
				stored.locationRadius = next;
			},
		},
	});
	return stored;
}

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("the post location field", () => {
	it("starts off the map with no accuracy slider", () => {
		renderField();

		expect(mapSwitch().getAttribute("aria-checked")).toBe("false");
		expect(accuracy()).toBeNull();
	});

	it("turns on at the least precise accuracy", async () => {
		const stored = renderField();

		await fireEvent.click(mapSwitch());

		expect(stored).toEqual({
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
		});
		expect(accuracy()?.getAttribute("aria-valuenow")).toBe("0");
		expect(accuracy()?.getAttribute("aria-valuetext")).toBe(
			"Within about 2.0 km",
		);
		expect(screen.getByText("Within about 2.0 km")).toBeTruthy();
	});

	it("narrows the radius as the slider moves toward More", async () => {
		const stored = renderField({
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
		});

		await fireEvent.keyDown(accuracy() as HTMLElement, { key: "End" });

		expect(stored.locationRadius).toBe(0);
		expect(accuracy()?.getAttribute("aria-valuetext")).toBe(
			"Within about 100 m",
		);
	});

	it("labels the radius in the user's units", () => {
		preferences.units = "imperial";
		renderField({ shareLocation: "DISTANCE_AND_MAP", locationRadius: 100 });

		expect(screen.getByText("Within about 1.2 mi")).toBeTruthy();
	});

	it("hides the slider when switched off", async () => {
		const stored = renderField({
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 40,
		});

		await fireEvent.click(mapSwitch());

		expect(stored.shareLocation).toBe("NONE");
		expect(accuracy()).toBeNull();
	});
});
