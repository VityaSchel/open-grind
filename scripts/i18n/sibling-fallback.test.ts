import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { FIXTURES, readLocaleFiles } from "./locale-files";
import { checkTranslation } from "./source-messages";

describe("plural gaps in a regional variant", () => {
	const source = readLocaleFiles(FIXTURES).get(SOURCE_LOCALE) ?? [];

	it.each([
		["es", "es-419, then English"],
		["es-419", "es, then English"],
		["pt-BR", "pt-PT, then English"],
		["pt-PT", "pt-BR, then English"],
	])("names the sibling before English for gaps in %s", (locale, shown) => {
		expect(
			checkTranslation({
				locale,
				files: [
					{
						namespace: "sample",
						text: JSON.stringify({
							photos_one: "1 foto",
							photos_other: "{{count}} fotos",
						}),
					},
				],
				source,
				offered: ["en", "es", "es-419", "pt-BR", "pt-PT", "zh-Hant"],
			}).warnings,
		).toEqual([
			`${locale}/sample.photos: has no text for _many, so those counts show in ${shown}`,
		]);
	});
});
