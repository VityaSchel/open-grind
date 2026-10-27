// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeGeohash } from "$lib/model/geohash";

const { preferencesSnapshotMock, setPreferencesMock } = vi.hoisted(() => ({
	preferencesSnapshotMock: vi.fn(),
	setPreferencesMock: vi.fn(),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: preferencesSnapshotMock,
	preferencesLoaded: () => true,
	setPreferences: setPreferencesMock,
}));
vi.mock("$lib/location/auto-location", () => ({
	autoLocation: {
		suspend: vi.fn(),
		resume: vi.fn(),
		refreshStaleFix: vi.fn(),
	},
}));
vi.mock("$lib/location/location-request.svelte", () => ({
	locationRequest: {
		run: vi.fn(),
		abort: vi.fn(),
		pending: false,
		lastFix: null,
	},
}));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: () => true }));
vi.mock("$lib/util/breakpoints.svelte", () => ({
	above: () => ({ current: true }),
}));

const LocationChange = (await import("./LocationChange.svelte")).default;

const changeLocationButton = () =>
	screen.getByRole("button", { name: "Change location" });
const saveButton = () => screen.getByRole("button", { name: "Save" });
const chooserState = () => screen.queryByRole("dialog")?.dataset.state;

describe("LocationChange", () => {
	beforeEach(() => {
		preferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: false,
			geohash: encodeGeohash({ lat: 48.8566, lon: 2.3522 }),
		});
	});

	afterEach(() => {
		cleanup();
		vi.resetAllMocks();
	});

	it("keeps a chooser reopened while the previous save is still being written", async () => {
		const { promise: write, resolve: finishWrite } =
			Promise.withResolvers<void>();
		setPreferencesMock.mockReturnValue(write);
		render(LocationChange);

		await fireEvent.click(changeLocationButton());
		await fireEvent.click(saveButton());
		await vi.waitFor(() => expect(chooserState()).toBeUndefined());
		await fireEvent.click(changeLocationButton());
		await vi.waitFor(() => expect(chooserState()).toBe("open"));

		finishWrite();
		await write;
		await tick();

		expect(setPreferencesMock).toHaveBeenCalledOnce();
		expect(chooserState()).toBe("open");
	});
});
