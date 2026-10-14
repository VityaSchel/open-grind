import { afterEach, describe, expect, it, vi } from "vitest";

import { PSEUDO_LOCALES } from "./pseudo";
import shipped from "./shipped.json";
import { SOURCE_LOCALE } from "./syntax";

const AMERICAN_ENGLISH = {
	catalog: SOURCE_LOCALE,
	english: "English (United States)",
	own: "English",
};

async function buildWith({
	dev,
	screenshots = false,
	shippedLanguages,
}: {
	dev: boolean;
	screenshots?: boolean;
	shippedLanguages?: readonly string[];
}) {
	vi.stubEnv("DEV", dev);
	if (screenshots) {
		vi.stubEnv("OPEN_GRIND_DEMO", "1");
		vi.stubEnv("OPEN_GRIND_SCREENSHOTS", "1");
	}
	vi.resetModules();
	if (shippedLanguages !== undefined) {
		vi.doMock("./shipped-files", () => ({
			shippedFiles: Object.fromEntries(
				shippedLanguages.map((language) => [
					`./locales/${language}/common.json`,
					() => Promise.resolve({}),
				]),
			),
		}));
	}
	const i18n = await import("./index");
	const listed = await import("./listed-languages");
	return { ...i18n, ...listed };
}

function catalogsOf(names: readonly { catalog: string }[]): string[] {
	return names.map(({ catalog }) => catalog).sort();
}

afterEach(() => {
	vi.doUnmock("./shipped-files");
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("the listed languages", () => {
	it.each([
		{ build: "screenshot", dev: false, screenshots: true },
		{ build: "release", dev: false, screenshots: false },
	])(
		"are English and shipped.json in $build builds",
		async ({ dev, screenshots }) => {
			const { listedLanguages } = await buildWith({ dev, screenshots });

			expect(catalogsOf(listedLanguages)).toEqual(
				[SOURCE_LOCALE, ...shipped].sort(),
			);
		},
	);

	it("are English and the shipped languages in screenshot builds that load more", async () => {
		const { listedLanguages, locales } = await buildWith({
			dev: false,
			screenshots: true,
			shippedLanguages: ["de", "pt-BR"],
		});

		expect(catalogsOf(listedLanguages)).toEqual(["de", "en", "pt-BR"]);
		expect(locales).toEqual(
			expect.arrayContaining(["fr", "zh-Hant", ...PSEUDO_LOCALES]),
		);
	});

	it("are every offered language in dev builds", async () => {
		const { listedLanguages, locales } = await buildWith({ dev: true });

		expect(catalogsOf(listedLanguages)).toEqual([...locales].sort());
		expect(catalogsOf(listedLanguages)).toEqual(
			expect.arrayContaining(PSEUDO_LOCALES),
		);
	});
});

describe("the listed current language", () => {
	it.each([
		...PSEUDO_LOCALES.map((locale) => ({ locale, catalog: locale })),
		{ locale: "fr-CA", catalog: "fr" },
	])(
		"is American English while $locale shows in screenshot builds",
		async ({ locale, catalog }) => {
			const { getCatalogLocale, getListedLanguage, setLocale } =
				await buildWith({
					dev: false,
					screenshots: true,
					shippedLanguages: ["de"],
				});

			await setLocale({ locale });

			expect(getCatalogLocale()).toBe(catalog);
			expect(getListedLanguage()).toEqual(AMERICAN_ENGLISH);
		},
	);

	it("is the shipped language that shows in screenshot builds", async () => {
		const { getListedLanguage, setLocale } = await buildWith({
			dev: false,
			screenshots: true,
			shippedLanguages: ["de"],
		});

		await setLocale({ locale: "de-AT" });

		expect(getListedLanguage()).toEqual({
			catalog: "de",
			english: "German",
			own: "Deutsch",
		});
	});

	it.each(PSEUDO_LOCALES)(
		"is %s while it shows in dev builds",
		async (locale) => {
			const { getListedLanguage, setLocale } = await buildWith({
				dev: true,
			});

			await setLocale({ locale });

			expect(getListedLanguage().catalog).toBe(locale);
		},
	);
});
