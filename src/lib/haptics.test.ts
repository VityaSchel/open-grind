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
import { hapticsAvailable, hapticThresholdReached } from "$lib/haptics";

const tauri = globalThis as {
	isTauri?: boolean;
	__TAURI_OS_PLUGIN_INTERNALS__?: { platform: string };
};

function runningOn(platform: string) {
	tauri.isTauri = true;
	tauri.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
}

beforeEach(async () => {
	invokeMock.mockReset().mockResolvedValue(undefined);
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	await setPreferences({ hapticFeedback: true });
});

afterEach(() => {
	delete tauri.isTauri;
	delete tauri.__TAURI_OS_PLUGIN_INTERNALS__;
});

describe("hapticsAvailable", () => {
	it("is true on the platforms with a native actuator", () => {
		runningOn("android");
		expect(hapticsAvailable()).toBe(true);

		runningOn("macos");
		expect(hapticsAvailable()).toBe(true);
	});

	it("is false where nothing can be played", () => {
		expect(hapticsAvailable()).toBe(false);

		runningOn("linux");
		expect(hapticsAvailable()).toBe(false);

		runningOn("windows");
		expect(hapticsAvailable()).toBe(false);
	});
});

describe("hapticThresholdReached", () => {
	it("asks the backend for a tap on a platform that has one", () => {
		runningOn("android");

		hapticThresholdReached();

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith(
			"haptic_threshold_reached",
		);
	});

	it("stays quiet where nothing can be played", () => {
		runningOn("windows");

		hapticThresholdReached();

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("stays quiet when the preference is off", async () => {
		runningOn("macos");
		await setPreferences({ hapticFeedback: false });

		hapticThresholdReached();

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("stays quiet until preferences have loaded", async () => {
		vi.resetModules();
		const haptics = await import("$lib/haptics");
		runningOn("android");

		haptics.hapticThresholdReached();

		expect(invokeMock).not.toHaveBeenCalled();
	});
});
