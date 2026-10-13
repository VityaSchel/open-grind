import { describe, expect, it } from "vitest";

import {
	catalogFor,
	messageChain,
	normalizeTag,
	type Offered,
	pickerTag,
	resolveLocale,
} from "./matcher";
import { parseLocalePath, SOURCE_LOCALE } from "./syntax";

const DIRECTORIES = [
	"ar",
	"cs",
	"da",
	"de",
	"en-GB",
	"es",
	"es-419",
	"fil",
	"fr",
	"hi",
	"id",
	"it",
	"ja",
	"ko",
	"ms",
	"nb",
	"nl",
	"pl",
	"pt-BR",
	"pt-PT",
	"ru",
	"sv",
	"th",
	"uk",
	"vi",
	"zh-Hans",
	"zh-Hant",
];

const PSEUDO = ["ar-XB", "en-XA", "en-XM"];

const dev: Offered = {
	catalogs: [SOURCE_LOCALE, ...DIRECTORIES, ...PSEUDO].sort(),
	pseudo: PSEUDO,
};

const release: Offered = {
	catalogs: ["de", "en", "es-419", "pt-BR", "zh-Hans"],
	pseudo: ["en-XA", "ar-XB"],
};

const directories = [
	...new Set(
		Object.keys(import.meta.glob("./locales/*/*.json")).map(
			(path) => parseLocalePath(path).locale,
		),
	),
];

function resolve({
	choice = null,
	system,
	offered,
}: {
	choice?: string | null;
	system: readonly string[];
	offered: Offered;
}): { locale: string; catalogs: string[] } {
	const { locale, catalog } = resolveLocale({ choice, system, offered });
	return { locale, catalogs: messageChain({ catalog, offered }) };
}

describe("normalizeTag", () => {
	it.each([
		["de_AT.UTF-8", "de-AT"],
		["en_US.ISO8859-1", "en-US"],
		["sr_RS@latin", "sr-Latn-RS"],
		["ca_ES@valencia", "ca-ES"],
		["de_DE.UTF-8@euro", "de-DE"],
		["es-mx", "es-MX"],
		["zh-hant-hk", "zh-Hant-HK"],
		["en-US-u-hc-h23", "en-US"],
		["de-DE-x-private", "de-DE"],
		["ca-ES-valencia", "ca-ES-valencia"],
		["tl", "fil"],
		["tl-PH", "fil-PH"],
		["sh", "sr-Latn"],
		["sh-RS", "sr-Latn-RS"],
		["cmn", "zh"],
		["cmn-Hans-CN", "zh-Hans-CN"],
		["cmn-TW", "zh-TW"],
		["in", "id"],
		["iw-IL", "he-IL"],
		["en-XA", "en-XA"],
	])("normalizes %s to %s", (raw, tag) => {
		expect(normalizeTag(raw)).toBe(tag);
	});

	it.each(["C", "C.UTF-8", "POSIX", "und", "und-US", "", "not a tag", "x"])(
		"skips %j",
		(raw) => {
			expect(normalizeTag(raw)).toBeUndefined();
		},
	);
});

describe("catalogFor", () => {
	it.each([
		["es-ES", "es", "es-419"],
		["es-MX", "es-419", "es-419"],
		["es-US", "es-419", "es-419"],
		["es-AR", "es-419", "es-419"],
		["es-CO", "es-419", "es-419"],
		["es-419", "es-419", "es-419"],
		["es", "es", "es-419"],
		["es-GQ", "es", "es-419"],
		["pt", "pt-BR", "pt-BR"],
		["pt-BR", "pt-BR", "pt-BR"],
		["pt-PT", "pt-PT", "pt-BR"],
		["pt-AO", "pt-PT", "pt-BR"],
		["pt-MZ", "pt-PT", "pt-BR"],
		["pt-US", "pt-BR", "pt-BR"],
		["zh", "zh-Hans", "zh-Hans"],
		["zh-CN", "zh-Hans", "zh-Hans"],
		["zh-SG", "zh-Hans", "zh-Hans"],
		["zh-Hans-TW", "zh-Hans", "zh-Hans"],
		["zh-TW", "zh-Hant", undefined],
		["zh-HK", "zh-Hant", undefined],
		["zh-MO", "zh-Hant", undefined],
		["zh-Hant", "zh-Hant", undefined],
		["zh-Hant-CN", "zh-Hant", undefined],
		["en", "en", "en"],
		["en-US", "en", "en"],
		["en-AU", "en-GB", "en"],
		["en-NZ", "en-GB", "en"],
		["en-IN", "en-GB", "en"],
		["en-IE", "en-GB", "en"],
		["en-ZA", "en-GB", "en"],
		["en-DE", "en-GB", "en"],
		["en-150", "en-GB", "en"],
		["en-001", "en-GB", "en"],
		["en-CA", "en", "en"],
		["en-PH", "en", "en"],
		["en-PR", "en", "en"],
		["nb-NO", "nb", undefined],
		["no", "nb", undefined],
		["nn-NO", "nb", undefined],
		["tl-PH", "fil", undefined],
		["fil", "fil", undefined],
		["de-AT", "de", "de"],
		["de_CH.UTF-8", "de", "de"],
		["de-Latn-DE", "de", "de"],
		["fr-CA", "fr", undefined],
		["uk-UA", "uk", undefined],
		["be-BY", undefined, undefined],
		["ca-ES", undefined, undefined],
		["hi-Latn", undefined, undefined],
		["ms-Arab", undefined, undefined],
		["sw-KE", undefined, undefined],
		["C", undefined, undefined],
	])("matches %s to %s in dev and %s in release", (tag, inDev, inRelease) => {
		expect(catalogFor({ tag, offered: dev })).toBe(inDev);
		expect(catalogFor({ tag, offered: release })).toBe(inRelease);
	});

	it.each([
		["es-GQ", "es"],
		["es", "es"],
		["pt", "pt-BR"],
		["pt-US", "pt-BR"],
		["en-PR", "en"],
	])(
		"prefers the default variant for %s whatever the catalog order",
		(tag, catalog) => {
			const reversed: Offered = {
				catalogs: dev.catalogs.toReversed(),
				pseudo: PSEUDO,
			};
			expect(catalogFor({ tag, offered: reversed })).toBe(catalog);
		},
	);

	it.each(PSEUDO)("matches %s only exactly in dev", (tag) => {
		expect(catalogFor({ tag, offered: dev })).toBe(tag);
	});

	it.each(release.pseudo)("matches %s to nothing in release", (tag) => {
		expect(catalogFor({ tag, offered: release })).toBeUndefined();
	});

	it("never matches a pseudo-locale for a real tag", () => {
		const pseudoOnly: Offered = {
			catalogs: ["ar-XB", "en", "en-XA"],
			pseudo: PSEUDO,
		};
		expect(
			catalogFor({ tag: "ar-EG", offered: pseudoOnly }),
		).toBeUndefined();
		expect(catalogFor({ tag: "ar", offered: pseudoOnly })).toBeUndefined();
		expect(catalogFor({ tag: "en-CA", offered: pseudoOnly })).toBe("en");
		expect(catalogFor({ tag: "en-GB", offered: pseudoOnly })).toBe("en");
		expect(catalogFor({ tag: "ar-EG", offered: dev })).toBe("ar");
	});

	it.each(directories)(
		"reaches the %s directory by its id, picker tag and language",
		(directory) => {
			const offered: Offered = {
				catalogs: [SOURCE_LOCALE, ...directories],
				pseudo: PSEUDO,
			};
			const { language } = new Intl.Locale(directory);
			expect(catalogFor({ tag: directory, offered })).toBe(directory);
			expect(catalogFor({ tag: pickerTag(directory), offered })).toBe(
				directory,
			);
			const bare = catalogFor({ tag: language, offered }) ?? "";
			expect(new Intl.Locale(bare).language).toBe(language);
		},
	);
});

describe("messageChain", () => {
	it.each([
		["es", ["es", "es-419", "en"]],
		["es-419", ["es-419", "es", "en"]],
		["pt-BR", ["pt-BR", "pt-PT", "en"]],
		["pt-PT", ["pt-PT", "pt-BR", "en"]],
		["zh-Hans", ["zh-Hans", "en"]],
		["zh-Hant", ["zh-Hant", "en"]],
		["en-GB", ["en-GB", "en"]],
		["en", ["en"]],
		["nb", ["nb", "en"]],
		["de", ["de", "en"]],
		["en-XA", ["en-XA", "en"]],
		["ar-XB", ["ar-XB", "en"]],
	])("falls back from %s through %j in dev", (catalog, chain) => {
		expect(messageChain({ catalog, offered: dev })).toEqual(chain);
	});

	it.each([
		["es-419", ["es-419", "en"]],
		["pt-BR", ["pt-BR", "en"]],
		["zh-Hans", ["zh-Hans", "en"]],
	])("uses only offered catalogs for %s in release", (catalog, chain) => {
		expect(messageChain({ catalog, offered: release })).toEqual(chain);
	});
});

describe("pickerTag", () => {
	it.each([
		["en", "en-US"],
		["es", "es-ES"],
		["es-419", "es-419"],
		["en-GB", "en-GB"],
		["pt-BR", "pt-BR"],
		["pt-PT", "pt-PT"],
		["zh-Hans", "zh-Hans"],
		["zh-Hant", "zh-Hant"],
		["de", "de"],
		["en-XA", "en-XA"],
	])("labels %s as %s", (catalog, tag) => {
		expect(pickerTag(catalog)).toBe(tag);
	});
});

describe("resolveLocale from the system languages", () => {
	it.each([
		{
			system: ["es-ES"],
			dev: { locale: "es-ES", catalogs: ["es", "es-419", "en"] },
			release: { locale: "es-ES", catalogs: ["es-419", "en"] },
		},
		{
			system: ["es-MX"],
			dev: { locale: "es-MX", catalogs: ["es-419", "es", "en"] },
			release: { locale: "es-MX", catalogs: ["es-419", "en"] },
		},
		{
			system: ["es-US"],
			dev: { locale: "es-US", catalogs: ["es-419", "es", "en"] },
			release: { locale: "es-US", catalogs: ["es-419", "en"] },
		},
		{
			system: ["es-AR"],
			dev: { locale: "es-AR", catalogs: ["es-419", "es", "en"] },
			release: { locale: "es-AR", catalogs: ["es-419", "en"] },
		},
		{
			system: ["es"],
			dev: { locale: "es", catalogs: ["es", "es-419", "en"] },
			release: { locale: "es", catalogs: ["es-419", "en"] },
		},
		{
			system: ["pt"],
			dev: { locale: "pt", catalogs: ["pt-BR", "pt-PT", "en"] },
			release: { locale: "pt", catalogs: ["pt-BR", "en"] },
		},
		{
			system: ["pt-AO"],
			dev: { locale: "pt-AO", catalogs: ["pt-PT", "pt-BR", "en"] },
			release: { locale: "pt-AO", catalogs: ["pt-BR", "en"] },
		},
		{
			system: ["pt-BR"],
			dev: { locale: "pt-BR", catalogs: ["pt-BR", "pt-PT", "en"] },
			release: { locale: "pt-BR", catalogs: ["pt-BR", "en"] },
		},
		{
			system: ["pt-PT"],
			dev: { locale: "pt-PT", catalogs: ["pt-PT", "pt-BR", "en"] },
			release: { locale: "pt-PT", catalogs: ["pt-BR", "en"] },
		},
		{
			system: ["zh"],
			dev: { locale: "zh", catalogs: ["zh-Hans", "en"] },
			release: { locale: "zh", catalogs: ["zh-Hans", "en"] },
		},
		{
			system: ["zh-TW"],
			dev: { locale: "zh-TW", catalogs: ["zh-Hant", "en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: ["zh-HK"],
			dev: { locale: "zh-HK", catalogs: ["zh-Hant", "en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: ["en-AU"],
			dev: { locale: "en-AU", catalogs: ["en-GB", "en"] },
			release: { locale: "en-AU", catalogs: ["en"] },
		},
		{
			system: ["en-CA"],
			dev: { locale: "en-CA", catalogs: ["en"] },
			release: { locale: "en-CA", catalogs: ["en"] },
		},
		{
			system: ["fr-CA", "de-DE"],
			dev: { locale: "fr-CA", catalogs: ["fr", "en"] },
			release: { locale: "de-DE", catalogs: ["de", "en"] },
		},
		{
			system: ["sw-KE"],
			dev: { locale: "en-US", catalogs: ["en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: ["sw-KE", "de-DE"],
			dev: { locale: "de-DE", catalogs: ["de", "en"] },
			release: { locale: "de-DE", catalogs: ["de", "en"] },
		},
		{
			system: ["ca-ES", "es-ES"],
			dev: { locale: "es-ES", catalogs: ["es", "es-419", "en"] },
			release: { locale: "es-ES", catalogs: ["es-419", "en"] },
		},
		{
			system: ["nn-NO"],
			dev: { locale: "nn-NO", catalogs: ["nb", "en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: ["no"],
			dev: { locale: "no", catalogs: ["nb", "en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: ["tl-PH"],
			dev: { locale: "fil-PH", catalogs: ["fil", "en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: ["de_AT.UTF-8"],
			dev: { locale: "de-AT", catalogs: ["de", "en"] },
			release: { locale: "de-AT", catalogs: ["de", "en"] },
		},
		{
			system: ["C", "de_DE.UTF-8"],
			dev: { locale: "de-DE", catalogs: ["de", "en"] },
			release: { locale: "de-DE", catalogs: ["de", "en"] },
		},
		{
			system: ["C"],
			dev: { locale: "en-US", catalogs: ["en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			system: [],
			dev: { locale: "en-US", catalogs: ["en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
	])("resolves $system", ({ system, ...expected }) => {
		expect(resolve({ system, offered: dev })).toEqual(expected.dev);
		expect(resolve({ system, offered: release })).toEqual(expected.release);
	});
});

describe("resolveLocale with an in-app choice", () => {
	it.each([
		{
			choice: "es-419",
			system: ["es-MX", "en-US"],
			dev: { locale: "es-MX", catalogs: ["es-419", "es", "en"] },
			release: { locale: "es-MX", catalogs: ["es-419", "en"] },
		},
		{
			choice: "es-ES",
			system: ["es-MX"],
			dev: { locale: "es-ES", catalogs: ["es", "es-419", "en"] },
			release: { locale: "es-ES", catalogs: ["es-419", "en"] },
		},
		{
			choice: "es-MX",
			system: ["en-US"],
			dev: { locale: "es-MX", catalogs: ["es-419", "es", "en"] },
			release: { locale: "es-MX", catalogs: ["es-419", "en"] },
		},
		{
			choice: "en-US",
			system: ["en-AU"],
			dev: { locale: "en-US", catalogs: ["en"] },
			release: { locale: "en-AU", catalogs: ["en"] },
		},
		{
			choice: "en-GB",
			system: ["en-AU"],
			dev: { locale: "en-AU", catalogs: ["en-GB", "en"] },
			release: { locale: "en-GB", catalogs: ["en"] },
		},
		{
			choice: "en-US",
			system: ["en-CA"],
			dev: { locale: "en-CA", catalogs: ["en"] },
			release: { locale: "en-CA", catalogs: ["en"] },
		},
		{
			choice: "de",
			system: ["de-AT"],
			dev: { locale: "de-AT", catalogs: ["de", "en"] },
			release: { locale: "de-AT", catalogs: ["de", "en"] },
		},
		{
			choice: "de",
			system: ["en-US"],
			dev: { locale: "de", catalogs: ["de", "en"] },
			release: { locale: "de", catalogs: ["de", "en"] },
		},
		{
			choice: "pt-PT",
			system: ["pt-BR"],
			dev: { locale: "pt-PT", catalogs: ["pt-PT", "pt-BR", "en"] },
			release: { locale: "pt-PT", catalogs: ["pt-BR", "en"] },
		},
		{
			choice: "zh-Hant",
			system: ["zh-HK"],
			dev: { locale: "zh-HK", catalogs: ["zh-Hant", "en"] },
			release: { locale: "en-US", catalogs: ["en"] },
		},
		{
			choice: "fr",
			system: ["fr-CA", "de"],
			dev: { locale: "fr-CA", catalogs: ["fr", "en"] },
			release: { locale: "de", catalogs: ["de", "en"] },
		},
		{
			choice: "en-XA",
			system: ["de"],
			dev: { locale: "en-XA", catalogs: ["en-XA", "en"] },
			release: { locale: "de", catalogs: ["de", "en"] },
		},
		{
			choice: "sw",
			system: ["de-DE"],
			dev: { locale: "de-DE", catalogs: ["de", "en"] },
			release: { locale: "de-DE", catalogs: ["de", "en"] },
		},
	])("resolves $choice on $system", ({ choice, system, ...expected }) => {
		expect(resolve({ choice, system, offered: dev })).toEqual(expected.dev);
		expect(resolve({ choice, system, offered: release })).toEqual(
			expected.release,
		);
	});
});
