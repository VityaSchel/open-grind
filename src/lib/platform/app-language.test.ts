import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LanguageSettings } from "./language-sync";

const { invokeMock, listenMock, tauri, preferences, catalogs } = vi.hoisted(
	() => {
		const stored: LanguageSettings = { language: null, languageSync: null };
		const saves: Partial<LanguageSettings>[] = [];
		return {
			invokeMock: vi.fn(),
			listenMock: vi.fn(),
			tauri: { enabled: false },
			preferences: { stored, readable: true, writable: true, saves },
			catalogs: { failing: new Set<string>(), loads: [] as string[] },
		};
	},
);

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
	isTauri: () => tauri.enabled,
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () =>
		preferences.readable
			? Promise.resolve({ ...preferences.stored })
			: Promise.reject(new Error("unreadable")),
	setPreferences: (values: Partial<LanguageSettings>) => {
		if (!preferences.writable) {
			return Promise.reject(new Error("read-only"));
		}
		preferences.saves.push(values);
		preferences.stored = { ...preferences.stored, ...values };
		return Promise.resolve();
	},
}));

vi.mock("$lib/i18n/catalog-files", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("$lib/i18n/catalog-files")>();
	const directories = ["de", "es", "es-419", "fr", "pt-BR", "pt-PT"];
	return {
		...actual,
		translationFiles: Object.fromEntries(
			directories.map((locale) => [
				`./locales/${locale}/common.json`,
				() => {
					catalogs.loads.push(locale);
					return catalogs.failing.has(locale)
						? Promise.reject(new Error(`No ${locale} catalog`))
						: Promise.resolve({});
				},
			]),
		),
	};
});

import { getCatalogLocale, getLocale, setLocale } from "$lib/i18n";
import { chooseLanguage, startLanguage } from "./app-language";
import { NATIVE_READ_TIMEOUT_MS } from "./regional-settings";

type ChangeHandler = (event: { payload: unknown }) => void;

function browserLanguages(languages: string[]): void {
	vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
}

function changeBrowserLanguages(languages: string[]): void {
	browserLanguages(languages);
	window.dispatchEvent(new Event("languagechange"));
}

function store(settings: Partial<LanguageSettings>): void {
	preferences.stored = { ...preferences.stored, ...settings };
}

function answerNative({
	languages,
	write = () => Promise.resolve(),
}: {
	languages: unknown;
	write?: () => Promise<void>;
}): void {
	invokeMock.mockImplementation((command: string) =>
		command === "app_languages" ? Promise.resolve(languages) : write(),
	);
}

function nativeWrites(): unknown[] {
	return invokeMock.mock.calls
		.filter(([command]) => command === "set_app_language")
		.map(([, args]) => args);
}

function emitNative(payload: unknown): void {
	const [[event, handler]] = listenMock.mock.calls as [
		[string, ChangeHandler],
	];
	expect(event).toBe("app-language-changed");
	handler({ payload });
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve));
}

function shown(): { locale: string; catalog: string; lang: string } {
	return {
		locale: getLocale(),
		catalog: getCatalogLocale(),
		lang: document.documentElement.lang,
	};
}

beforeEach(() => {
	invokeMock.mockReset();
	listenMock.mockReset().mockResolvedValue(() => {});
	tauri.enabled = false;
	preferences.stored = { language: null, languageSync: null };
	preferences.readable = true;
	preferences.writable = true;
	preferences.saves = [];
	catalogs.failing.clear();
	catalogs.loads = [];
	browserLanguages(["en-US"]);
});

afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	history.replaceState(null, "", "/");
	await setLocale({ locale: "en-US" });
});

describe("startLanguage in a browser", () => {
	it("shows the first browser language the app offers", async () => {
		browserLanguages(["sw-KE", "fr-CA", "de-DE"]);

		await startLanguage();

		expect(shown()).toEqual({
			locale: "fr-CA",
			catalog: "fr",
			lang: "fr-CA",
		});
		expect(preferences.saves).toEqual([]);
	});

	it("falls back to American English when no language matches", async () => {
		await setLocale({ locale: "de" });
		browserLanguages(["sw-KE", "ja-JP"]);

		await startLanguage();

		expect(shown()).toEqual({
			locale: "en-US",
			catalog: "en",
			lang: "en-US",
		});
	});

	it("puts a stored choice before the browser's languages", async () => {
		store({ language: "es-419" });
		browserLanguages(["de-DE", "es-MX"]);

		await startLanguage();

		expect(shown()).toEqual({
			locale: "es-MX",
			catalog: "es-419",
			lang: "es-MX",
		});
		expect(preferences.saves).toEqual([]);
	});

	it("follows the browser's languages while nothing is chosen", async () => {
		browserLanguages(["fr-CA"]);
		await startLanguage();

		changeBrowserLanguages(["sw-KE", "de-AT"]);

		await vi.waitFor(() => expect(getLocale()).toBe("de-AT"));
		expect(getCatalogLocale()).toBe("de");
	});

	it("keeps a stored choice when the browser's languages change", async () => {
		store({ language: "fr" });
		await startLanguage();

		changeBrowserLanguages(["de-AT"]);
		await settle();

		expect(getLocale()).toBe("fr");
	});

	it("clears a stored choice the app no longer offers", async () => {
		store({ language: "sw" });
		browserLanguages(["de-DE"]);

		await startLanguage();

		expect(preferences.saves).toEqual([
			{ language: null, languageSync: null },
		]);
		expect(getLocale()).toBe("de-DE");
	});

	it("detects without writing when the preferences can’t be read", async () => {
		preferences.readable = false;
		browserLanguages(["de-DE"]);

		await startLanguage();

		expect(getLocale()).toBe("de-DE");
		expect(preferences.saves).toEqual([]);
	});

	it("stays in American English when the language can’t load", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		catalogs.failing.add("de");
		browserLanguages(["de-DE"]);

		await expect(startLanguage()).resolves.toBeUndefined();

		expect(getLocale()).toBe("en-US");
		expect(consoleError).toHaveBeenCalled();
	});
});

describe("the dev ?locale= pin", () => {
	it("wins over a stored choice and the browser and is never stored", async () => {
		history.replaceState(null, "", "/chat?locale=en-XA");
		store({ language: "de" });
		browserLanguages(["fr-FR"]);

		await startLanguage();
		changeBrowserLanguages(["es-ES"]);
		await settle();

		expect(getLocale()).toBe("en-XA");
		expect(preferences.saves).toEqual([]);
	});

	it("reads a regional tag through the matcher", async () => {
		history.replaceState(null, "", "/?locale=es-MX");

		await startLanguage();

		expect(shown()).toEqual({
			locale: "es-MX",
			catalog: "es-419",
			lang: "es-MX",
		});
	});

	it("is ignored when it matches nothing", async () => {
		history.replaceState(null, "", "/?locale=xx-YY");
		browserLanguages(["de-DE"]);

		await startLanguage();

		expect(getLocale()).toBe("de-DE");
	});
});

describe("startLanguage in the app", () => {
	beforeEach(() => {
		tauri.enabled = true;
	});

	it("reads secondary system languages from the native side", async () => {
		answerNative({
			languages: { tier: "none", app: null, system: ["sw-KE", "pt-AO"] },
		});
		browserLanguages(["sw-KE"]);

		await startLanguage();

		expect(invokeMock).toHaveBeenCalledWith("app_languages");
		expect(shown()).toEqual({
			locale: "pt-AO",
			catalog: "pt-PT",
			lang: "pt-AO",
		});
	});

	it("adopts a per-app language set in the system settings", async () => {
		store({ language: "de", languageSync: { native: "de" } });
		answerNative({
			languages: { tier: "two-way", app: "es_MX", system: ["en-US"] },
		});

		await startLanguage();

		expect(preferences.stored).toEqual({
			language: "es-MX",
			languageSync: { native: "es-MX" },
		});
		expect(shown()).toEqual({
			locale: "es-MX",
			catalog: "es-419",
			lang: "es-MX",
		});
		expect(nativeWrites()).toEqual([]);
	});

	it("writes a stored choice the system hasn't seen", async () => {
		store({ language: "de" });
		answerNative({
			languages: { tier: "two-way", app: null, system: ["en-US"] },
		});

		await startLanguage();

		expect(nativeWrites()).toEqual([{ tag: "de" }]);
		expect(preferences.stored.languageSync).toEqual({ native: "de" });
		expect(getLocale()).toBe("de");
	});

	it("retries a failed write on the next native report", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		store({ language: "de" });
		answerNative({
			languages: { tier: "two-way", app: null, system: ["en-US"] },
			write: () => Promise.reject(new Error("denied")),
		});
		await startLanguage();
		expect(preferences.stored.languageSync).toEqual({ native: null });

		answerNative({
			languages: { tier: "two-way", app: null, system: ["en-US"] },
		});
		emitNative({ tier: "two-way", app: null, system: ["en-US"] });

		await vi.waitFor(() =>
			expect(preferences.stored.languageSync).toEqual({ native: "de" }),
		);
		expect(nativeWrites()).toEqual([{ tag: "de" }, { tag: "de" }]);
	});

	it("follows native reports of the system's languages", async () => {
		answerNative({
			languages: { tier: "none", app: null, system: ["en-US"] },
		});
		await startLanguage();

		emitNative({ tier: "none", app: null, system: ["fr-BE"] });

		await vi.waitFor(() => expect(getLocale()).toBe("fr-BE"));
	});

	it("leaves the shown language alone on a report that changes nothing", async () => {
		answerNative({
			languages: { tier: "none", app: null, system: ["fr-FR"] },
		});
		await startLanguage();
		expect(catalogs.loads).toEqual(["fr"]);

		emitNative({ tier: "none", app: null, system: ["fr-FR", "de-DE"] });
		await settle();

		expect(catalogs.loads).toEqual(["fr"]);
	});

	it("ignores the browser's languages once the native side answers", async () => {
		answerNative({
			languages: { tier: "none", app: null, system: ["fr-FR"] },
		});
		await startLanguage();

		changeBrowserLanguages(["de-DE"]);
		await settle();

		expect(getLocale()).toBe("fr-FR");
	});

	it("lets a native report win over a slower first read", async () => {
		let answer: (value: unknown) => void = () => {};
		invokeMock.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);

		const started = startLanguage();
		await vi.waitFor(() => expect(listenMock).toHaveBeenCalled());
		emitNative({ tier: "none", app: null, system: ["fr-FR"] });
		answer({ tier: "none", app: null, system: ["de-DE"] });
		await started;
		await settle();

		expect(getLocale()).toBe("fr-FR");
	});

	it("keeps the languages of an answer whose sync fields it can’t read", async () => {
		store({ language: "fr", languageSync: { native: "fr" } });
		answerNative({
			languages: { tier: "sideways", app: 5, system: ["de-DE", 7] },
		});

		await startLanguage();

		expect(getLocale()).toBe("fr");
		expect(preferences.saves).toEqual([]);
		expect(nativeWrites()).toEqual([]);
	});

	it("clears a per-app value that is no language tag", async () => {
		store({ language: "fr", languageSync: { native: "fr" } });
		answerNative({
			languages: { tier: "two-way", app: "C", system: ["de-DE"] },
		});

		await startLanguage();

		expect(nativeWrites()).toEqual([{ tag: null }]);
		expect(preferences.stored).toEqual({
			language: null,
			languageSync: { native: null },
		});
		expect(getLocale()).toBe("de-DE");
	});

	it.each([
		["an unreadable answer", () => Promise.resolve(null)],
		["a failed read", () => Promise.reject(new Error("no command"))],
	])("follows the browser's languages after %s", async (_, languages) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		invokeMock.mockImplementation(languages);
		browserLanguages(["de-DE"]);

		await startLanguage();
		expect(getLocale()).toBe("de-DE");

		changeBrowserLanguages(["fr-FR"]);
		await vi.waitFor(() => expect(getLocale()).toBe("fr-FR"));
	});

	it("stops waiting for a slow read but still applies it", async () => {
		vi.useFakeTimers();
		let answer: (value: unknown) => void = () => {};
		invokeMock.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		browserLanguages(["de-DE"]);

		const started = startLanguage();
		await vi.advanceTimersByTimeAsync(NATIVE_READ_TIMEOUT_MS);
		await started;
		expect(getLocale()).toBe("de-DE");

		answer({ tier: "none", app: null, system: ["fr-FR"] });
		await vi.waitFor(() => expect(getLocale()).toBe("fr-FR"));
	});
});

describe("chooseLanguage", () => {
	it("switches at once and stores the choice", async () => {
		browserLanguages(["es-MX"]);
		await startLanguage();
		expect(getCatalogLocale()).toBe("es-419");

		await chooseLanguage({ tag: "es-ES" });

		expect(shown()).toEqual({
			locale: "es-ES",
			catalog: "es",
			lang: "es-ES",
		});
		expect(preferences.stored).toEqual({
			language: "es-ES",
			languageSync: null,
		});
		expect(nativeWrites()).toEqual([]);
	});

	it("keeps reporting the system's own variant of the chosen catalog", async () => {
		browserLanguages(["en-US", "es-MX"]);
		await startLanguage();

		await chooseLanguage({ tag: "es-419" });

		expect(getLocale()).toBe("es-MX");
	});

	it("writes the choice to a two-way platform", async () => {
		tauri.enabled = true;
		answerNative({
			languages: { tier: "two-way", app: null, system: ["en-US"] },
		});
		await startLanguage();

		await chooseLanguage({ tag: "fr" });

		expect(nativeWrites()).toEqual([{ tag: "fr" }]);
		expect(preferences.stored).toEqual({
			language: "fr",
			languageSync: { native: "fr" },
		});
	});

	it("remembers a failed write so the next report retries it", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		tauri.enabled = true;
		let denied = true;
		answerNative({
			languages: { tier: "two-way", app: "de", system: ["en-US"] },
			write: () =>
				denied
					? Promise.reject(new Error("denied"))
					: Promise.resolve(),
		});
		await startLanguage();

		await chooseLanguage({ tag: "fr" });

		expect(getLocale()).toBe("fr");
		expect(preferences.stored).toEqual({
			language: "fr",
			languageSync: { native: "de" },
		});

		denied = false;
		await chooseLanguage({ tag: "es" });
		denied = true;
		await chooseLanguage({ tag: "pt-PT" });

		expect(preferences.stored).toEqual({
			language: "pt-PT",
			languageSync: { native: "es" },
		});
	});

	it("keeps the language and stores nothing when it can’t load", async () => {
		tauri.enabled = true;
		answerNative({
			languages: { tier: "two-way", app: null, system: ["de-DE"] },
		});
		await startLanguage();
		preferences.saves = [];
		catalogs.failing.add("fr");

		await expect(chooseLanguage({ tag: "fr" })).rejects.toThrow("No fr");

		expect(getLocale()).toBe("de-DE");
		expect(preferences.saves).toEqual([]);
		expect(nativeWrites()).toEqual([]);
	});

	it("goes back to the language shown when the choice can’t be stored", async () => {
		browserLanguages(["de-DE"]);
		await startLanguage();
		preferences.writable = false;

		await expect(chooseLanguage({ tag: "fr" })).rejects.toThrow(
			"read-only",
		);

		expect(shown()).toEqual({
			locale: "de-DE",
			catalog: "de",
			lang: "de-DE",
		});
	});

	it("lets the last of overlapping choices win", async () => {
		await startLanguage();

		const first = chooseLanguage({ tag: "de" });
		await chooseLanguage({ tag: "fr" });
		await first;

		expect(getLocale()).toBe("fr");
		expect(preferences.stored.language).toBe("fr");
	});

	it("refuses a language the app doesn't offer", async () => {
		await startLanguage();

		await expect(chooseLanguage({ tag: "sw" })).rejects.toThrow(RangeError);

		expect(preferences.saves).toEqual([]);
	});
});
