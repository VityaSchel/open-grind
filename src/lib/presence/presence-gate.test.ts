import { beforeEach, describe, expect, it, vi } from "vitest";

const { preferences, pushDeeplinkAheadMock } = vi.hoisted(() => ({
	preferences: { loaded: true, stayOnline: true },
	pushDeeplinkAheadMock: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesLoaded: () => preferences.loaded,
	preferencesSnapshot: () => preferences,
}));
vi.mock("$lib/push/opening-deeplink", () => ({
	pushDeeplinkAhead: pushDeeplinkAheadMock,
}));

import { showsOnReturn, staysOnline } from "./presence-gate";

beforeEach(() => {
	preferences.loaded = true;
	preferences.stayOnline = true;
	pushDeeplinkAheadMock.mockResolvedValue(false);
});

describe("staysOnline", () => {
	it("follows the preference once preferences have loaded", () => {
		expect(staysOnline()).toBe(true);

		preferences.stayOnline = false;

		expect(staysOnline()).toBe(false);
	});

	it("treats preferences that have not loaded yet as Stay online off", () => {
		preferences.loaded = false;

		expect(staysOnline()).toBe(false);
	});
});

describe("showsOnReturn", () => {
	it("is true only for the screen on show", async () => {
		expect(await showsOnReturn({ viewActive: true })).toBe(true);
		expect(await showsOnReturn({ viewActive: false })).toBe(false);
	});

	it("is false for a return that is opening a notification", async () => {
		pushDeeplinkAheadMock.mockResolvedValue(true);

		expect(await showsOnReturn({ viewActive: true })).toBe(false);
	});
});
