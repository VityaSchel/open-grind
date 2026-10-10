// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";

vi.mock("$lib/location/location-request.svelte", () => ({
	locationRequest: { pending: false, lastFix: null },
}));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: () => false }));

const GeoMapPicker = (await import("./GeoMapPicker.svelte")).default;

const PARIS = { lat: 48.8566, lon: 2.3522 };

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function titled(element: Element | null) {
	return [
		element?.getAttribute("title"),
		element?.getAttribute("aria-label"),
	];
}

function mapLabels(container: HTMLElement) {
	return {
		zoomIn: titled(container.querySelector(".leaflet-control-zoom-in")),
		zoomOut: titled(container.querySelector(".leaflet-control-zoom-out")),
		pin: container
			.querySelector(".leaflet-marker-icon")
			?.getAttribute("title"),
	};
}

function translatedLabels() {
	const zoomIn = t("browse.locationChooser.map.zoomIn");
	const zoomOut = t("browse.locationChooser.map.zoomOut");
	return {
		zoomIn: [zoomIn, zoomIn],
		zoomOut: [zoomOut, zoomOut],
		pin: t("browse.locationChooser.map.selectedLocation"),
	};
}

describe("GeoMapPicker labels", () => {
	it("relabels the zoom buttons and the pin when the locale switches", async () => {
		const { container } = render(GeoMapPicker, {
			props: { pinPos: PARIS },
		});
		await vi.waitFor(() =>
			expect(
				container.querySelector(".leaflet-marker-icon"),
			).not.toBeNull(),
		);
		expect(mapLabels(container)).toEqual({
			zoomIn: ["Zoom in", "Zoom in"],
			zoomOut: ["Zoom out", "Zoom out"],
			pin: "Selected location",
		});

		await setLocale({ locale: "en-XA" });
		flushSync();
		await vi.waitFor(() =>
			expect(mapLabels(container)).toEqual(translatedLabels()),
		);
		expect(mapLabels(container).pin).not.toBe("Selected location");
	});

	it("rebuilds the zoom control in the current locale when unlocked", async () => {
		const { container, rerender } = render(GeoMapPicker, {
			props: { pinPos: PARIS, locked: true },
		});
		await vi.waitFor(() =>
			expect(
				container.querySelector(".leaflet-marker-icon"),
			).not.toBeNull(),
		);
		expect(container.querySelector(".leaflet-control-zoom")).toBeNull();

		await setLocale({ locale: "en-XA" });
		flushSync();
		await rerender({ locked: false });

		expect(mapLabels(container).zoomIn).toEqual(translatedLabels().zoomIn);
		expect(mapLabels(container).zoomIn[0]).not.toBe("Zoom in");
	});
});
