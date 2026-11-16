import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { FIXTURES, readLocaleFiles } from "./locale-files";
import { weblatePluralForms } from "./weblate-plurals";

describe("weblatePluralForms", () => {
	const saved = [...readLocaleFiles(FIXTURES)]
		.filter(([locale]) => locale !== SOURCE_LOCALE)
		.map(([locale, files]) => {
			const forms = files.flatMap(({ text }) =>
				Array.from(
					text.matchAll(/"photos_(\w+)"/g),
					([, form]) => form,
				),
			);
			return [locale, forms] as const;
		});

	it.each(saved)("offers the forms Weblate saved for %s", (locale, forms) => {
		expect(weblatePluralForms(locale).offered).toEqual(forms);
	});

	it.each([
		["en", ["one"]],
		["de", ["one"]],
		["fr", []],
		["pt-BR", []],
		["hi", []],
		["cs", ["one"]],
		["pl", ["one"]],
		["he", ["one", "two"]],
		["ar", ["zero", "one", "two"]],
		["ru", []],
		["uk", []],
		["lv", []],
		["ja", []],
	])("finds the single-number forms of %s", (locale, forms) => {
		expect([...weblatePluralForms(locale).singleNumber]).toEqual(forms);
	});

	it.each([
		["de", "one", ["one"]],
		["de", "other", ["other"]],
		["fr", "one", ["one", "other"]],
		["ru", "one", ["one", "other"]],
		["ru", "few", ["other"]],
		["ar", "zero", ["other"]],
		["he", "two", ["other"]],
		["ja", "other", ["one", "other"]],
	])("maps %s _%s to the English forms %j", (locale, category, forms) => {
		const { sourceCategories } = weblatePluralForms(locale);
		expect(sourceCategories.get(category)).toEqual(new Set(forms));
	});
});
