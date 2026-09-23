import { afterEach, describe, expect, it, vi } from "vitest";

import { FCM_COMPONENT, GOOGLE_OAUTH_COMPONENT } from "./components";
import { manualInstallHref } from "./manual-install";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("manualInstallHref", () => {
	it("points a Google Play build at the install guide", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");

		expect(manualInstallHref(FCM_COMPONENT)).toBe(
			"https://opengrind.org/guides/notifications#installing-the-fcm-service",
		);
		expect(manualInstallHref(GOOGLE_OAUTH_COMPONENT)).toBe(
			"https://opengrind.org/guides/sign-in-with-google#installed-from-google-play",
		);
	});

	it("points every other build at the add-on's releases", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "");

		expect(manualInstallHref(FCM_COMPONENT)).toBe(
			"https://git.opengrind.org/open-grind/fcm-service/releases",
		);
		expect(manualInstallHref(GOOGLE_OAUTH_COMPONENT)).toBe(
			"https://git.opengrind.org/open-grind/google-oauth-app/releases#install",
		);
	});
});
