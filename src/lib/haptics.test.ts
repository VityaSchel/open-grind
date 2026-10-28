import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, readMock, writeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	readMock: vi.fn(),
	writeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import { hapticsAvailable, playHaptic } from "$lib/haptics";
import { resetPlatform, runningOn } from "$lib/test/platform";

beforeEach(async () => {
	invokeMock.mockReset().mockResolvedValue(undefined);
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	await setPreferences({ hapticFeedback: true });
});

afterEach(resetPlatform);

describe("hapticsAvailable", () => {
	it("is true on the platforms with a native actuator", () => {
		runningOn("android");
		expect(hapticsAvailable()).toBe(true);

		runningOn("ios");
		expect(hapticsAvailable()).toBe(true);

		runningOn("macos");
		expect(hapticsAvailable()).toBe(true);
	});

	it("is false where nothing can be played", () => {
		runningOn("linux");
		expect(hapticsAvailable()).toBe(false);

		runningOn("windows");
		expect(hapticsAvailable()).toBe(false);
	});
});

describe("playHaptic", () => {
	it.each(["android", "ios", "macos"] as const)(
		"asks the backend for the named kind on %s",
		(platform) => {
			runningOn(platform);

			playHaptic("longPress");

			expect(invokeMock).toHaveBeenCalledExactlyOnceWith("play_haptic", {
				kind: "longPress",
			});
		},
	);

	it("stays quiet where nothing can be played", () => {
		runningOn("windows");

		playHaptic("threshold");

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("stays quiet when the preference is off", async () => {
		runningOn("macos");
		await setPreferences({ hapticFeedback: false });

		playHaptic("threshold");

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("stays quiet until preferences have loaded", async () => {
		vi.resetModules();
		const haptics = await import("$lib/haptics");
		runningOn("android");

		haptics.playHaptic("dragStart");

		expect(invokeMock).not.toHaveBeenCalled();
	});
});
