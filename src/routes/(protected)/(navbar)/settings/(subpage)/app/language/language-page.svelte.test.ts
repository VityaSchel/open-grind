// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock, showErrorToastMock, catalogs, navigated } =
	vi.hoisted(() => ({
		readMock: vi.fn(),
		writeMock: vi.fn(),
		showErrorToastMock: vi.fn(),
		catalogs: {
			failing: new Set<string>(),
			held: new Map<string, PromiseWithResolvers<void>>(),
			requested: [] as string[],
		},
		navigated: [] as ((navigation: { type: string }) => void)[],
	}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$app/navigation", () => ({
	afterNavigate: (callback: (typeof navigated)[number]) => {
		navigated.push(callback);
	},
}));
vi.mock("$lib/i18n/catalog-files", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("$lib/i18n/catalog-files")>();
	const directories = ["de", "es", "es-419", "fr"];
	return {
		...actual,
		translationFiles: Object.fromEntries(
			directories.map((locale) => [
				`./locales/${locale}/common.json`,
				async () => {
					catalogs.requested.push(locale);
					await catalogs.held.get(locale)?.promise;
					if (catalogs.failing.has(locale)) {
						throw new Error(`No ${locale} catalog`);
					}
					return {};
				},
			]),
		),
	};
});

import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import LanguagePage from "./+page.svelte";

const OFFERED = [
	["Arabic (Pseudo-Bidi)", "Arabic (Pseudo-Bidi)"],
	["English (Key Markers)", "English"],
	["English (Pseudo-Accents)", "English (Pseudo-Accents)"],
	["English (United States)", "English"],
	["French", "Français"],
	["German", "Deutsch"],
	["Spanish (Latin America)", "Español (Latinoamérica)"],
	["Spanish (Spain)", "Español (España)"],
];

const option = (english: string) =>
	screen.getByRole("radio", {
		name: new RegExp(`^${english.replace(/[()]/g, "\\$&")} `),
	});

function lines(
	radio: HTMLElement,
): { text: string; lang: string | null; translate: string | null }[] {
	return [
		radio.querySelector('[data-slot="item-title"]'),
		radio.querySelector('[data-slot="item-description"]'),
	].map((line) => ({
		text: line?.textContent.trim() ?? "",
		lang: line?.getAttribute("lang") ?? null,
		translate: line?.getAttribute("translate") ?? null,
	}));
}

function englishNames(): string[] {
	return screen
		.getAllByRole("radio")
		.map((radio) => lines(radio)[0]?.text ?? "");
}

function checkedNames(): string[] {
	return screen
		.getAllByRole("radio")
		.filter((radio) => radio.getAttribute("aria-checked") === "true")
		.map((radio) => lines(radio)[0]?.text ?? "");
}

const scrollIntoView = vi.fn();

beforeEach(async () => {
	navigated.length = 0;
	scrollIntoView.mockReset();
	Element.prototype.scrollIntoView = scrollIntoView;
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	showErrorToastMock.mockReset();
	catalogs.failing.clear();
	catalogs.held.clear();
	catalogs.requested.length = 0;
	await setPreferences({ language: null, languageSync: null });
	await setLocale({ locale: "en-US" });
	writeMock.mockClear();
});

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("the Language page", () => {
	it("lists each offered language by its English name over its own name", () => {
		render(LanguagePage);

		const radios = screen.getAllByRole("radio");
		expect(
			radios.map((radio) => lines(radio).map(({ text }) => text)),
		).toEqual(OFFERED);
		expect(lines(option("German"))).toEqual([
			{ text: "German", lang: "en", translate: "no" },
			{ text: "Deutsch", lang: "de", translate: "no" },
		]);
		expect(lines(option("Spanish (Latin America)"))[1]?.lang).toBe(
			"es-419",
		);
		expect(radios.filter((radio) => radio.querySelector("div, p"))).toEqual(
			[],
		);
	});

	it.each([
		["opens", "link", ["German"]],
		["comes back", "popstate", []],
	])(
		"centers the checked language when the page %s",
		async (_, type, revealed) => {
			await setLocale({ locale: "de-AT" });
			render(LanguagePage);

			for (const callback of navigated) callback({ type });
			await Promise.resolve();

			expect(
				scrollIntoView.mock.contexts.map(
					(row) => lines(row as HTMLElement)[0]?.text,
				),
			).toEqual(revealed);
			for (const options of scrollIntoView.mock.calls) {
				expect(options).toEqual([{ block: "center" }]);
			}
		},
	);

	it("checks the detected language while nothing is chosen", async () => {
		await setLocale({ locale: "de-AT" });

		render(LanguagePage);

		expect(checkedNames()).toEqual(["German"]);
		expect((await getPreferences()).language).toBeNull();
	});

	it("switches the language at once and remembers it", async () => {
		render(LanguagePage);
		const german = option("German");

		await fireEvent.click(german);

		expect(checkedNames()).toEqual(["German"]);
		await waitFor(() => expect(document.documentElement.lang).toBe("de"));
		expect(option("German")).toBe(german);
		expect(englishNames()).toEqual(OFFERED.map(([english]) => english));
		await waitFor(async () =>
			expect(await getPreferences()).toMatchObject({ language: "de" }),
		);
		expect(writeMock).toHaveBeenCalled();
	});

	it("keeps the English names when the page changes language", async () => {
		render(LanguagePage);
		const group = screen.getByRole("group");
		expect(group.getAttribute("aria-label")).toBe("Language");

		await fireEvent.click(option("English (Pseudo-Accents)"));

		await waitFor(() =>
			expect(group.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE),
		);
		expect(englishNames()).toEqual(OFFERED.map(([english]) => english));
		expect(checkedNames()).toEqual(["English (Pseudo-Accents)"]);
	});

	it("chooses American English by its regional tag", async () => {
		await setLocale({ locale: "fr" });
		render(LanguagePage);

		await fireEvent.click(option("English (United States)"));

		await waitFor(() =>
			expect(document.documentElement.lang).toBe("en-US"),
		);
		await waitFor(async () =>
			expect((await getPreferences()).language).toBe("en-US"),
		);
	});

	it("moves focus with the arrow keys without switching", async () => {
		render(LanguagePage);
		const [first, second] = screen.getAllByRole("radio");
		first?.focus();

		await fireEvent.keyDown(first as HTMLElement, { key: "ArrowDown" });

		expect(document.activeElement).toBe(second);
		expect(checkedNames()).toEqual(["English (United States)"]);
		expect(document.documentElement.lang).toBe("en-US");
		expect(writeMock).not.toHaveBeenCalled();
	});

	it("ignores a click on the checked language", async () => {
		render(LanguagePage);

		await fireEvent.click(option("English (United States)"));

		expect(checkedNames()).toEqual(["English (United States)"]);
		await new Promise((resolve) => setTimeout(resolve));
		expect(writeMock).not.toHaveBeenCalled();
		expect((await getPreferences()).language).toBeNull();
	});

	it("keeps the language and says so when the new one can’t load", async () => {
		catalogs.failing.add("fr");
		render(LanguagePage);

		await fireEvent.click(option("French"));

		await waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ label: "Couldn’t save setting" }),
			),
		);
		expect(checkedNames()).toEqual(["English (United States)"]);
		expect(document.documentElement.lang).toBe("en-US");
		expect(writeMock).not.toHaveBeenCalled();
	});

	it("turns back and says so when the choice can’t be saved", async () => {
		writeMock.mockRejectedValueOnce(new Error("disk full"));
		render(LanguagePage);

		await fireEvent.click(option("German"));

		await waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ label: "Couldn’t save setting" }),
			),
		);
		expect(checkedNames()).toEqual(["English (United States)"]);
		expect(document.documentElement.lang).toBe("en-US");
	});

	it("checks the new language while its catalog loads", async () => {
		const french = Promise.withResolvers<void>();
		catalogs.held.set("fr", french);
		render(LanguagePage);

		await fireEvent.click(option("French"));

		expect(checkedNames()).toEqual(["French"]);
		expect(document.documentElement.lang).toBe("en-US");
		french.resolve();
		await waitFor(() => expect(document.documentElement.lang).toBe("fr"));
		expect(checkedNames()).toEqual(["French"]);
	});

	it("keeps the last of two quick choices checked", async () => {
		const german = Promise.withResolvers<void>();
		const french = Promise.withResolvers<void>();
		catalogs.held.set("de", german);
		catalogs.held.set("fr", french);
		render(LanguagePage);

		await fireEvent.click(option("German"));
		await fireEvent.click(option("French"));
		expect(checkedNames()).toEqual(["French"]);
		german.resolve();
		await waitFor(() => expect(catalogs.requested).toContain("fr"));
		await new Promise((resolve) => setTimeout(resolve));

		expect(document.documentElement.lang).toBe("de");
		expect((await getPreferences()).language).toBe("de");
		expect(checkedNames()).toEqual(["French"]);
		french.resolve();
		await waitFor(async () =>
			expect((await getPreferences()).language).toBe("fr"),
		);
		expect(document.documentElement.lang).toBe("fr");
		expect(checkedNames()).toEqual(["French"]);
	});
});
