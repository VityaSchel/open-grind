import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({
	preferencesSnapshot: vi.fn(() => ({ showMatureContent: false })),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);

import {
	MATURE_CONTENT_SETTING_HREF,
	matureContentCovered,
} from "./mature-content";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("matureContentCovered", () => {
	it("covers mature content on the Google Play build by default", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");

		expect(matureContentCovered()).toBe(true);
	});

	it("stops covering on the Google Play build once mature content is shown", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		preferences.preferencesSnapshot.mockReturnValueOnce({
			showMatureContent: true,
		});

		expect(matureContentCovered()).toBe(false);
	});

	it("never covers on any other build", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "");

		expect(matureContentCovered()).toBe(false);
	});
});

describe("MATURE_CONTENT_SETTING_HREF", () => {
	it("points at the switch on the app settings page", () => {
		expect(MATURE_CONTENT_SETTING_HREF).toBe(
			"/settings/app#show-mature-content",
		);
	});
});
