import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
	invoke: vi.fn<(command: string) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { SupportedPlatform } from "#lib/platform/os.ts";
import { canOpenAppSettings, openAppSettings } from "./app-settings";

const opensAppSettings = {
	android: true,
	ios: true,
	linux: false,
	macos: false,
	windows: false,
} as const satisfies Record<SupportedPlatform, boolean>;

const platforms = Object.keys(opensAppSettings) as SupportedPlatform[];

afterEach(() => {
	resetPlatform();
	invoke.mockReset();
});

describe("canOpenAppSettings", () => {
	it.each(platforms)("on %s matches the native command", (platform) => {
		runningOn(platform);
		expect(canOpenAppSettings()).toBe(opensAppSettings[platform]);
	});
});

describe("openAppSettings", () => {
	it.each(platforms.filter((platform) => opensAppSettings[platform]))(
		"on %s asks native to open the app's settings page",
		(platform) => {
			runningOn(platform);
			invoke.mockResolvedValue(null);
			openAppSettings();
			expect(invoke).toHaveBeenCalledExactlyOnceWith("open_app_settings");
		},
	);

	it.each(platforms.filter((platform) => !opensAppSettings[platform]))(
		"on %s invokes nothing",
		(platform) => {
			runningOn(platform);
			openAppSettings();
			expect(invoke).not.toHaveBeenCalled();
		},
	);
});
