import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({
	preferencesSnapshot: vi.fn(() => ({ albumWarningSeen: false })),
	setPreferences: vi.fn(() => Promise.resolve()),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);

import { albumWarningDue, markAlbumWarningSeen } from "./album-warning";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("albumWarningDue", () => {
	it("is due on the Google Play build until the warning was seen", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");

		expect(albumWarningDue()).toBe(true);
	});

	it("is not due on the Google Play build once the warning was seen", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		preferences.preferencesSnapshot.mockReturnValueOnce({
			albumWarningSeen: true,
		});

		expect(albumWarningDue()).toBe(false);
	});

	it("is never due on any other build", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "");

		expect(albumWarningDue()).toBe(false);
	});
});

describe("markAlbumWarningSeen", () => {
	it("remembers the warning on this device", () => {
		markAlbumWarningSeen();

		expect(preferences.setPreferences).toHaveBeenCalledWith({
			albumWarningSeen: true,
		});
	});
});
