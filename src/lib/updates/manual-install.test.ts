import { readFileSync } from "node:fs";
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
			"https://opengrind.org/guides/notifications#android-fast-mode",
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

	it.each([FCM_COMPONENT, GOOGLE_OAUTH_COMPONENT] as const)(
		"sends a Google Play build of %s to a guide section that exists",
		(addon) => {
			vi.stubEnv("OPEN_GRIND_STORE", "play");
			const guide = new URL(manualInstallHref(addon));
			const page = readFileSync(
				`docs/content${guide.pathname}.md`,
				"utf8",
			);

			expect(sectionIds(page)).toContain(guide.hash.slice(1));
		},
	);
});

function sectionIds(markdown: string): string[] {
	return markdown
		.split("\n")
		.filter((line) => /^#{1,6} /.test(line))
		.map(
			(heading) =>
				/\{#([\w-]+)\}\s*$/.exec(heading)?.[1] ??
				heading
					.replace(/^#+ /, "")
					.trim()
					.toLowerCase()
					.replace(/[^\w\s-]/g, "")
					.replace(/\s+/g, "-"),
		);
}
