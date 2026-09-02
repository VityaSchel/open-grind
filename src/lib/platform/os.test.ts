import { afterEach, describe, expect, it } from "vitest";

import {
	isAndroidPlatform,
	isLinuxPlatform,
	isMobilePlatform,
} from "$lib/platform/os";

const tauri = globalThis as {
	isTauri?: boolean;
	__TAURI_OS_PLUGIN_INTERNALS__?: { platform: string };
};

function runningOn(platform: string) {
	tauri.isTauri = true;
	tauri.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
}

afterEach(() => {
	delete tauri.isTauri;
	delete tauri.__TAURI_OS_PLUGIN_INTERNALS__;
});

describe("isMobilePlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isMobilePlatform()).toBe(false);
	});

	it("is true on android and ios", () => {
		runningOn("android");
		expect(isMobilePlatform()).toBe(true);

		runningOn("ios");
		expect(isMobilePlatform()).toBe(true);
	});

	it("is false on desktop", () => {
		runningOn("macos");
		expect(isMobilePlatform()).toBe(false);
	});
});

describe("isAndroidPlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isAndroidPlatform()).toBe(false);
	});

	it("distinguishes android from the other mobile platform", () => {
		runningOn("android");
		expect(isAndroidPlatform()).toBe(true);

		runningOn("ios");
		expect(isAndroidPlatform()).toBe(false);
	});
});

describe("isLinuxPlatform", () => {
	it("is false outside Tauri instead of reading the missing os plugin", () => {
		expect(isLinuxPlatform()).toBe(false);
	});

	it("is true only on linux", () => {
		runningOn("linux");
		expect(isLinuxPlatform()).toBe(true);

		runningOn("android");
		expect(isLinuxPlatform()).toBe(false);
	});
});
