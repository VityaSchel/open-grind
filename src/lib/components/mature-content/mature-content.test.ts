import { afterEach, describe, expect, it, vi } from "vitest";

const GATED_ACCOUNT = 858049792;

const preferences = vi.hoisted(() => ({
	preferencesSnapshot: vi.fn(() => ({ showMatureContent: false })),
}));
const session = vi.hoisted(() => ({
	signedInProfileIdSnapshot: vi.fn<() => number | null>(() => 858049792),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);
vi.mock("#lib/api/current-session.ts", () => session);

import {
	MATURE_CONTENT_SETTING_HREF,
	matureContentCovered,
} from "./mature-content";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("matureContentCovered", () => {
	it("covers mature content on the Google Play build for the gated account by default", () => {
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

	it("never covers for another account, even on the Google Play build", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		session.signedInProfileIdSnapshot.mockReturnValueOnce(
			GATED_ACCOUNT + 1,
		);

		expect(matureContentCovered()).toBe(false);
	});

	it("never covers before an account is signed in", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		session.signedInProfileIdSnapshot.mockReturnValueOnce(null);

		expect(matureContentCovered()).toBe(false);
	});

	it("never covers on any other build", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "");

		expect(matureContentCovered()).toBe(false);
	});
});

describe("MATURE_CONTENT_SETTING_HREF", () => {
	it("points at the switch on the Display settings page", () => {
		expect(MATURE_CONTENT_SETTING_HREF).toBe(
			"/settings/app/display#show-mature-content",
		);
	});
});
