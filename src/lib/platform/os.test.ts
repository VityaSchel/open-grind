import { afterEach, describe, expect, it } from "vitest";

import {
	currentPlatform,
	isAndroidPlatform,
	isDesktopPlatform,
	isLinuxPlatform,
	isMacosPlatform,
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

const singlePlatformHelpers = {
	android: isAndroidPlatform,
	linux: isLinuxPlatform,
	macos: isMacosPlatform,
} as const satisfies Partial<Record<SupportedPlatform, () => boolean>>;

const platforms = Object.keys(families) as SupportedPlatform[];

const helpers = {
	currentPlatform,
	isMobilePlatform,
	isDesktopPlatform,
	...singlePlatformHelpers,
};

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

describe("single-platform helpers", () => {
	it.each(platforms)("only the %s helper is true there", (platform) => {
		runningOn(platform);
		for (const [name, helper] of Object.entries(singlePlatformHelpers)) {
			expect(helper()).toBe(name === platform);
		}
	});
});
