import { decode, encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultFilters } from "$lib/model/browse/grid/filters";
import {
	NATIVE_READ_LIMIT_MS,
	NATIVE_READ_TIMEOUT_MS,
} from "$lib/platform/regional-settings";

const { files, invokeMock, listenMock, storage, tauri, toastError } =
	vi.hoisted(() => ({
		files: new Map<string, Uint8Array>(),
		invokeMock: vi.fn(),
		listenMock: vi.fn(),
		storage: { writable: true },
		tauri: { enabled: true },
		toastError: vi.fn(),
	}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: (path: string) => Promise.resolve(files.has(path)),
	readAppDataFile: (path: string) => {
		const content = files.get(path);
		return content === undefined
			? Promise.reject(new Error(`No app data file at ${path}`))
			: Promise.resolve(content);
	},
	writeAppDataFileAtomic: ({
		path,
		content,
	}: {
		path: string;
		content: Uint8Array;
	}) => {
		if (!storage.writable) return Promise.reject(new Error("read-only"));
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

vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));

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

function stored(): Record<string, unknown> | undefined {
	const content = files.get(PREFERENCES);
	return content === undefined
		? undefined
		: (decode(content) as Record<string, unknown>);
}

beforeEach(() => {
	files.clear();
	storage.writable = true;
	invokeMock.mockReset();
	listenMock.mockReset().mockResolvedValue(() => {});
	toastError.mockReset();
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
			expect(stored()?.units).toBe(units);
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
		expect(stored()?.units).toBe("metric");
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
		expect(stored()?.units).toBe("metric");
	});

	it("stay as first written when the system changes later", async () => {
		const first = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "us" }),
		});
		await first.preferences.getPreferences();

		const next = await launch({
			system: systemWith({
				locale: "de-DE",
				measurementSystem: "metric",
			}),
		});

		expect((await next.preferences.getPreferences()).units).toBe(
			"imperial",
		);
	});

	it("still load when the first write fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		storage.writable = false;
		const { preferences } = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "us" }),
		});

		expect((await preferences.getPreferences()).units).toBe("imperial");
		expect(files.has(PREFERENCES)).toBe(false);
		expect(consoleError).toHaveBeenCalledWith(new Error("read-only"));
		expect(toastError).not.toHaveBeenCalled();
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

	it("survive signing out and a later system change when they match the system's", async () => {
		const first = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "us" }),
		});
		await first.preferences.setPreferences({ units: "imperial" });
		await first.preferences.clearAccountPreferences();

		const next = await launch({
			system: systemWith({
				locale: "de-DE",
				measurementSystem: "metric",
			}),
		});

		expect((await next.preferences.getPreferences()).units).toBe(
			"imperial",
		);
	});
});

describe("signing out", () => {
	it("drops the account settings and keeps the app settings", async () => {
		const { preferences } = await launch({
			system: systemWith({ locale: "en-US", measurementSystem: "us" }),
		});
		await preferences.setPreferences({
			autoUpdateLocation: true,
			geohash: "u33dc0cpke7v",
			gridSearchFilters: { ...defaultFilters, genders: [1, 2] },
			hapticFeedback: false,
			notificationsEnabled: true,
			stayOnline: false,
			units: "metric",
		});

		await preferences.clearAccountPreferences();

		expect(stored()).toMatchObject({
			autoUpdateLocation: false,
			geohash: null,
			hapticFeedback: false,
			notificationsEnabled: false,
			stayOnline: false,
			units: "metric",
		});
		expect(stored()).not.toHaveProperty("gridSearchFilters");
	});
});

describe("the interface language", () => {
	const system = systemWith({ locale: "de-DE", measurementSystem: "metric" });

	it("starts undecided and is not detected into the first write", async () => {
		const { preferences } = await launch({ system });

		expect(await preferences.getPreferences()).toMatchObject({
			language: null,
			languageSync: null,
		});
		expect(stored()).toMatchObject({ language: null, languageSync: null });
	});

	it("survives signing out", async () => {
		const first = await launch({ system });
		await first.preferences.setPreferences({
			language: "es-419",
			languageSync: { native: "es-419" },
		});
		await first.preferences.clearAccountPreferences();

		const next = await launch({ system });

		expect(await next.preferences.getPreferences()).toMatchObject({
			language: "es-419",
			languageSync: { native: "es-419" },
		});
	});

	it.each([
		["seen with no system language", { native: null }],
		["never seen", null],
	])("keeps a sync state %s apart", async (_, languageSync) => {
		const first = await launch({ system });
		await first.preferences.setPreferences({ languageSync });

		const next = await launch({ system });

		expect((await next.preferences.getPreferences()).languageSync).toEqual(
			languageSync,
		);
		expect(stored()?.languageSync).toEqual(languageSync);
	});

	it("drops stored values it can’t read and keeps the rest", async () => {
		files.set(
			PREFERENCES,
			encode({
				language: "C",
				languageSync: { native: 5 },
				hapticFeedback: false,
			}),
		);
		const { preferences } = await launch({ system });

		expect(await preferences.getPreferences()).toMatchObject({
			language: null,
			languageSync: null,
			hapticFeedback: false,
		});
	});
});

describe("stored settings that can’t be read", () => {
	it("offer a reset to defaults", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		files.set(PREFERENCES, Uint8Array.of(0xc1));
		const { preferences } = await launch({
			system: systemWith({
				locale: "en-US",
				measurementSystem: "metric",
			}),
		});

		await expect(preferences.getPreferences()).rejects.toThrow();

		expect(toastError).toHaveBeenCalledExactlyOnceWith(
			"Couldn’t load app settings. Reset to defaults?",
			expect.objectContaining({
				action: expect.objectContaining({ label: "Reset" }),
			}),
		);
	});
});
