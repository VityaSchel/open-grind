import { describe, expect, it } from "vitest";

import {
	LANGUAGE_NAMES,
	languageName,
	languageNamesOf,
} from "./language-names";
import { PSEUDO_LOCALES } from "./pseudo";
import { parseLocalePath } from "./syntax";

const directories = [
	...new Set(
		Object.keys(import.meta.glob("./locales/*/*.json")).map(
			(path) => parseLocalePath(path).locale,
		),
	),
];

describe("the language names", () => {
	it("name every locale directory and pseudo-locale once", () => {
		expect(directories).toEqual(
			expect.arrayContaining(["en", "es", "es-419", "zh-Hant"]),
		);
		expect(LANGUAGE_NAMES.map(({ catalog }) => catalog).sort()).toEqual(
			[...directories, ...PSEUDO_LOCALES].sort(),
		);
	});

	it("are listed alphabetically by their English names", () => {
		const english = LANGUAGE_NAMES.map((name) => name.english);
		const collator = new Intl.Collator("en");

		expect(english).toEqual(
			[...english].sort((a, b) => collator.compare(a, b)),
		);
	});

	it("start with a capital letter in their own language", () => {
		for (const { catalog, own } of LANGUAGE_NAMES) {
			const first = own.charAt(0);
			expect(first, catalog).toBe(first.toLocaleUpperCase(catalog));
		}
	});

	it("give English and Spanish their regions", () => {
		expect(["en", "en-GB", "es", "es-419"].map(languageName)).toEqual([
			{
				catalog: "en",
				english: "English (United States)",
				own: "English",
			},
			{
				catalog: "en-GB",
				english: "English (United Kingdom)",
				own: "English (United Kingdom)",
			},
			{
				catalog: "es",
				english: "Spanish (Spain)",
				own: "Español (España)",
			},
			{
				catalog: "es-419",
				english: "Spanish (Latin America)",
				own: "Español (Latinoamérica)",
			},
		]);
	});

	it("keep the table order for any offered catalogs", () => {
		const offered = ["zh-Hant", "es-419", "en", "de"];

		expect(languageNamesOf(offered).map(({ english }) => english)).toEqual([
			"Chinese (Traditional)",
			"English (United States)",
			"German",
			"Spanish (Latin America)",
		]);
	});

	it("fall back to the catalog id for a catalog the table lacks", () => {
		expect(languageName("sw")).toEqual({
			catalog: "sw",
			english: "sw",
			own: "sw",
		});
		expect(languageNamesOf(["sw", "de"])).toEqual([languageName("de")]);
	});
});
