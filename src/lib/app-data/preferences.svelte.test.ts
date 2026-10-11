import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	NATIVE_READ_LIMIT_MS,
	NATIVE_READ_TIMEOUT_MS,
} from "$lib/platform/regional-settings";

const { files, invokeMock, listenMock, tauri } = vi.hoisted(() => ({
	files: new Map<string, Uint8Array>(),
	invokeMock: vi.fn(),
	listenMock: vi.fn(),
	tauri: { enabled: true },
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: (path: string) => Promise.resolve(files.has(path)),
	readAppDataFile: (path: string) => {
		const content = files.get(path);
		return content === undefined
			? Promise.reject(new Error(`No app data file at ${path}`))
			: Promise.resolve(content);
	},
	removeAppDataFile: (path: string) => {
		files.delete(path);
		return Promise.resolve();
	},
	writeAppDataFileAtomic: ({
		path,
		content,
	}: {
		path: string;
		content: Uint8Array;
	}) => {
		files.set(path, content);
		return Promise.resolve();
	},
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
	isTauri: () => tauri.enabled,
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

const PREFERENCES = "preferences.data";

async function launch({ system }: { system: () => Promise<unknown> }) {
	vi.resetModules();
	invokeMock.mockImplementation(system);
	const { startRegionalSettings } =
		await import("$lib/platform/regional-settings");
	const started = startRegionalSettings();
	const preferences = await import("$lib/app-data/preferences.svelte");
	return { started, preferences };
}

const systemWith = (settings: object) => () => Promise.resolve(settings);

beforeEach(() => {
	files.clear();
	invokeMock.mockReset();
	listenMock.mockReset().mockResolvedValue(() => {});
	tauri.enabled = true;
	vi.useRealTimers();
});

describe("units on first run", () => {
	it.each([
		["us", "imperial"],
		["uk", "imperial"],
		["metric", "metric"],
	] as const)(
		"follow a %s measurement system",
		async (measurementSystem, units) => {
			const { preferences } = await launch({
				system: systemWith({ locale: "en-US", measurementSystem }),
			});

			expect((await preferences.getPreferences()).units).toBe(units);
			expect(files.has(PREFERENCES)).toBe(false);
		},
	);

	it("wait for the system read that is still running", async () => {
		const { preferences } = await launch({
			system: () =>
				new Promise((resolve) =>
					setTimeout(
						() =>
							resolve({
								locale: "en-US",
								measurementSystem: "us",
							}),
						50,
					),
				),
		});

		expect((await preferences.getPreferences()).units).toBe("imperial");
	});

	it.each([
		["reports no measurement system", systemWith({ locale: "en-US" })],
		["answers with nothing it can read", systemWith({ units: "us" })],
		["fails", () => Promise.reject(new Error("no plugin"))],
	])("fall back to metric when the system %s", async (_, system) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { preferences } = await launch({ system });

		expect((await preferences.getPreferences()).units).toBe("metric");
	});

	it("wait for a system read that outlasts the startup timeout", async () => {
		vi.useFakeTimers();
		const { started, preferences } = await launch({
			system: () =>
				new Promise((resolve) =>
					setTimeout(
						() =>
							resolve({
								locale: "en-US",
								measurementSystem: "us",
							}),
						NATIVE_READ_TIMEOUT_MS * 4,
					),
				),
		});

		const loaded = preferences.getPreferences();
		await vi.advanceTimersByTimeAsync(NATIVE_READ_TIMEOUT_MS);
		await started;
		await vi.advanceTimersByTimeAsync(NATIVE_READ_TIMEOUT_MS * 3);

		expect((await loaded).units).toBe("imperial");
	});

	it("fall back to metric when the system never answers", async () => {
		vi.useFakeTimers();
		const { started, preferences } = await launch({
			system: () => new Promise(() => {}),
		});

		const loaded = preferences.getPreferences();
		await vi.advanceTimersByTimeAsync(NATIVE_READ_TIMEOUT_MS);
		await started;
		let settled = false;
		void loaded.then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(
			NATIVE_READ_LIMIT_MS - NATIVE_READ_TIMEOUT_MS - 1,
		);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);

		expect((await loaded).units).toBe("metric");
	});
});

describe("stored units", () => {
	it("stay as stored whatever the system uses", async () => {
		files.set(PREFERENCES, encode({ units: "metric" }));
		const { preferences } = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "us" }),
		});

		expect((await preferences.getPreferences()).units).toBe("metric");
	});

	it("keep today's metric default for settings stored without units", async () => {
		files.set(PREFERENCES, encode({ hapticFeedback: false }));
		const { preferences } = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "uk" }),
		});

		expect(await preferences.getPreferences()).toMatchObject({
			hapticFeedback: false,
			units: "metric",
		});
	});

	it("survive signing out when they differ from the system's", async () => {
		const us = systemWith({ locale: "en-US", measurementSystem: "us" });
		const first = await launch({ system: us });
		await first.preferences.setPreferences({ units: "metric" });
		await first.preferences.clearAccountPreferences();

		const next = await launch({ system: us });

		expect(files.has(PREFERENCES)).toBe(true);
		expect((await next.preferences.getPreferences()).units).toBe("metric");
	});

	it("are dropped with the rest of the defaults on signing out", async () => {
		const { preferences } = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "us" }),
		});
		await preferences.setPreferences({ units: "imperial" });
		await preferences.clearAccountPreferences();

		expect(files.has(PREFERENCES)).toBe(false);
	});
});
