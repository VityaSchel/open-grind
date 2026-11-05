// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({
	units: "metric",
	geohash: null as string | null,
}));

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
	preferences.geohash = null;
});

const mapPreview = (container: HTMLElement) =>
	container.querySelector('[data-slot="post-location-map"]');

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
		expect(accuracy()?.getAttribute("aria-valuenow")).toBe("100");
		expect(accuracy()?.getAttribute("aria-valuetext")).toBe(
			"Within about 100 m",
		);
	});

	it("previews the shared area on a map around the stored location", () => {
		preferences.geohash = "u33dc0cpgp00";
		const { container } = render(PostLocationField, {
			props: { shareLocation: "DISTANCE_AND_MAP", locationRadius: 50 },
		});

		expect(mapPreview(container)).not.toBeNull();
	});

	it("shows no map preview without a stored location or while off the map", () => {
		const { container } = render(PostLocationField, {
			props: { shareLocation: "DISTANCE_AND_MAP", locationRadius: 50 },
		});
		expect(mapPreview(container)).toBeNull();
		cleanup();

		preferences.geohash = "u33dc0cpgp00";
		const off = render(PostLocationField, {
			props: { shareLocation: "NONE", locationRadius: 50 },
		});
		expect(mapPreview(off.container)).toBeNull();
	});

	it("keeps the map switch and the accuracy in one group", () => {
		const { container } = render(PostLocationField, {
			props: { shareLocation: "DISTANCE_AND_MAP", locationRadius: 50 },
		});

		const group = container.querySelector('[data-slot="post-location"]');
		expect(group?.contains(mapSwitch())).toBe(true);
		expect(group?.contains(accuracy())).toBe(true);
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
		await vi.waitFor(() => expect(accuracy()).toBeNull());
	});
});
