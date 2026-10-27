import { afterEach, describe, expect, it } from "vitest";

import {
	currentPlatform,
	isDesktopPlatform,
	isMobilePlatform,
	type SupportedPlatform,
} from "$lib/platform/os";
import { resetPlatform, runningOn } from "$lib/test/platform";

const families = {
	android: "mobile",
	ios: "mobile",
	linux: "desktop",
	macos: "desktop",
	windows: "desktop",
} as const satisfies Record<SupportedPlatform, "mobile" | "desktop">;

const platforms = Object.keys(families) as SupportedPlatform[];

const helpers = { currentPlatform, isMobilePlatform, isDesktopPlatform };

afterEach(resetPlatform);

describe("currentPlatform", () => {
	it.each(platforms)("reports %s", (platform) => {
		runningOn(platform);
		expect(currentPlatform()).toBe(platform);
	});

	it.each(["dragonfly", "freebsd", "netbsd", "openbsd", "solaris"])(
		"refuses %s, which Open Grind does not build for",
		(host) => {
			Object.assign(globalThis, {
				__TAURI_OS_PLUGIN_INTERNALS__: { platform: host },
			});
			expect(currentPlatform).toThrow(
				`Open Grind does not support ${host}`,
			);
		},
	);
});

describe("without the Tauri os plugin", () => {
	it.each(Object.entries(helpers))(
		"%s throws instead of guessing a platform",
		(_, helper) => {
			resetPlatform();
			expect(helper).toThrow(TypeError);
		},
	);
});

describe("isMobilePlatform and isDesktopPlatform", () => {
	it.each(platforms)("put %s in exactly one family", (platform) => {
		runningOn(platform);
		expect(isMobilePlatform()).toBe(families[platform] === "mobile");
		expect(isDesktopPlatform()).toBe(families[platform] === "desktop");
	});
});
