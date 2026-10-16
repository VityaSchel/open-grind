import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { LanguageSettings } from "./language-sync";
import { NATIVE_READ_TIMEOUT_MS } from "./regional-settings";

const { invokeMock, tauri, os, preferences } = vi.hoisted(() => {
	const stored: LanguageSettings = { language: null, languageSync: null };
	return {
		invokeMock: vi.fn(),
		tauri: { enabled: true },
		os: { platform: "android" },
		preferences: { stored, writable: true },
	};
});

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
	isTauri: () => tauri.enabled,
}));

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => os.platform }));

vi.mock("@tauri-apps/api/event", () => ({
	listen: () => Promise.resolve(() => {}),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ ...preferences.stored }),
	setPreferences: (values: Partial<LanguageSettings>) => {
		if (!preferences.writable) {
			return Promise.reject(new Error("read-only"));
		}
		preferences.stored = { ...preferences.stored, ...values };
		return Promise.resolve();
	},
}));

vi.mock("$lib/i18n/catalog-files", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/i18n/catalog-files")>()),
	translationFiles: Object.fromEntries(
		["de", "es-419", "fr", "zh-Hans"].map((locale) => [
			`./locales/${locale}/common.json`,
			() => Promise.resolve({}),
		]),
	),
}));

const COMMAND = "set_native_language";
const FRESH_IMPORTS_TIMEOUT_MS = 60_000;

type Snapshot = { tier: string; app: string | null; system: string[] };

const ANDROID_12: Snapshot = { tier: "none", app: null, system: ["en-US"] };

function answer({
	languages = () => Promise.resolve(ANDROID_12),
	native = () => Promise.resolve(),
}: {
	languages?: () => Promise<Snapshot>;
	native?: () => Promise<void>;
} = {}): void {
	invokeMock.mockImplementation((command: string) =>
		command === "app_languages" ? languages() : native(),
	);
}

const reading = (languages: Snapshot) => () => Promise.resolve(languages);

function after<T>({ ms, value }: { ms: number; value: T }): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function sent(): unknown[] {
	return invokeMock.mock.calls
		.filter(([command]) => command === COMMAND)
		.map(([, args]) => args);
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve));
}

async function load() {
	vi.resetModules();
	const { setLocale } = await import("$lib/i18n");
	const native = await import("./native-language");
	const app = await import("./app-language");
	return { setLocale, ...native, ...app };
}

beforeAll(async () => {
	await load();
}, FRESH_IMPORTS_TIMEOUT_MS);

beforeEach(() => {
	vi.restoreAllMocks();
	invokeMock.mockReset();
	answer();
	tauri.enabled = true;
	os.platform = "android";
	preferences.stored = { language: null, languageSync: null };
	preferences.writable = true;
	vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
	history.replaceState(null, "", "/");
});

describe("publishNativeLanguage", () => {
	it.each([
		["es-MX", "es-419"],
		["zh-CN", "zh-Hans"],
		["de-AT", "de"],
		["en-US", "en-US"],
	])(
		"sends the catalog shown for %s on Android 9–12",
		async (locale, tag) => {
			const { setLocale, publishNativeLanguage } = await load();
			await setLocale({ locale });

			await publishNativeLanguage({ choice: locale, tier: "none" });

			expect(sent()).toEqual([{ tag }]);
		},
	);

	it("clears the tag while the app follows the system", async () => {
		const { setLocale, publishNativeLanguage } = await load();
		await setLocale({ locale: "de" });

		await publishNativeLanguage({ choice: null, tier: "none" });

		expect(sent()).toEqual([{ tag: null }]);
	});

	it("leaves a two-way platform to its per-app language", async () => {
		const { setLocale, publishNativeLanguage } = await load();
		await setLocale({ locale: "de" });

		await publishNativeLanguage({ choice: "de", tier: "two-way" });

		expect(sent()).toEqual([{ tag: null }]);
	});

	it.each([
		["the desktop app", true, "macos"],
		["a browser", false, "android"],
	])("sends nothing in %s", async (_, enabled, platform) => {
		tauri.enabled = enabled;
		os.platform = platform;
		const {
			setLocale,
			publishNativeLanguage,
			publishPinnedNativeLanguage,
		} = await load();
		await setLocale({ locale: "de" });

		await publishNativeLanguage({ choice: "de", tier: "none" });
		await publishPinnedNativeLanguage();

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("sends a tag only when it changes", async () => {
		const { setLocale, publishNativeLanguage } = await load();
		await setLocale({ locale: "de" });

		await publishNativeLanguage({ choice: "de", tier: "none" });
		await publishNativeLanguage({ choice: "de-DE", tier: "none" });
		await publishNativeLanguage({ choice: null, tier: "none" });
		await publishNativeLanguage({ choice: "de", tier: "two-way" });
		await publishNativeLanguage({ choice: "de", tier: "none" });

		expect(sent()).toEqual([{ tag: "de" }, { tag: null }, { tag: "de" }]);
	});

	it("logs a failed send and sends the same tag again next time", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const denied = new Error("denied");
		answer({ native: () => Promise.reject(denied) });
		const { setLocale, publishNativeLanguage } = await load();
		await setLocale({ locale: "de" });

		await expect(
			publishNativeLanguage({ choice: "de", tier: "none" }),
		).resolves.toBeUndefined();
		answer();
		await publishNativeLanguage({ choice: "de", tier: "none" });

		expect(consoleError).toHaveBeenCalledWith(
			"Failed to set the native text language",
			denied,
		);
		expect(sent()).toEqual([{ tag: "de" }, { tag: "de" }]);
	});
});

describe("the interface language", () => {
	it("sends a stored choice once it shows on Android 9–12", async () => {
		preferences.stored = { language: "es-MX", languageSync: null };
		const { startLanguage } = await load();

		await startLanguage();
		await settle();

		expect(sent()).toEqual([{ tag: "es-419" }]);
	});

	it("sends no tag on Android 13 and later", async () => {
		preferences.stored = { language: "de", languageSync: { native: "de" } };
		answer({
			languages: reading({
				tier: "two-way",
				app: "de",
				system: ["en-US"],
			}),
		});
		const { startLanguage } = await load();

		await startLanguage();
		await settle();

		expect(sent()).toEqual([{ tag: null }]);
	});

	it("sends nothing while the native read has failed", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		preferences.stored = { language: "de", languageSync: null };
		answer({ languages: () => Promise.reject(new Error("no command")) });
		const { startLanguage, chooseLanguage } = await load();

		await startLanguage();
		await chooseLanguage({ tag: "fr" });
		await settle();

		expect(preferences.stored.language).toBe("fr");
		expect(sent()).toEqual([]);
	});

	it(
		"sends only what a late native read reports",
		async () => {
			preferences.stored = { language: "de", languageSync: null };
			answer({
				languages: () =>
					after({
						ms: NATIVE_READ_TIMEOUT_MS + 50,
						value: {
							tier: "two-way",
							app: null,
							system: ["en-US"],
						},
					}),
			});
			const { startLanguage } = await load();

			await startLanguage();
			await settle();
			const early = sent();
			await after({ ms: 100, value: undefined });

			expect(early).toEqual([]);
			expect(sent()).toEqual([{ tag: null }]);
		},
		FRESH_IMPORTS_TIMEOUT_MS,
	);

	it("sends each new choice after it is stored", async () => {
		const { startLanguage, chooseLanguage } = await load();
		await startLanguage();

		await chooseLanguage({ tag: "fr" });
		await settle();

		expect(preferences.stored.language).toBe("fr");
		expect(sent()).toEqual([{ tag: null }, { tag: "fr" }]);
	});

	it.each([
		["the stored choice", "de", "de"],
		["the cleared tag", null, null],
	])(
		"sends %s again when a new choice can’t be stored",
		async (_, language, tag) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			preferences.stored = { language, languageSync: null };
			answer({ native: () => Promise.reject(new Error("busy")) });
			const { startLanguage, chooseLanguage } = await load();
			await startLanguage();
			await settle();
			answer();
			preferences.writable = false;

			await expect(chooseLanguage({ tag: "fr" })).rejects.toThrow(
				"read-only",
			);
			await settle();

			expect(sent()).toEqual([{ tag }, { tag }]);
		},
	);

	it("sends a dev ?locale= pin whatever the tier", async () => {
		history.replaceState(null, "", "/?locale=en-XA");
		answer({
			languages: reading({
				tier: "two-way",
				app: null,
				system: ["en-US"],
			}),
		});
		const { startLanguage } = await load();

		await startLanguage();
		await settle();

		expect(sent()).toEqual([{ tag: "en-XA" }]);
	});
});
