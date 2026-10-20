import { afterEach, describe, expect, it, vi } from "vitest";

import { searchLanguage } from "$lib/util/language";

afterEach(() => {
	vi.restoreAllMocks();
});

function withLanguage(language: string) {
	vi.spyOn(navigator, "language", "get").mockReturnValue(language);
}

describe("searchLanguage", () => {
	it.each([
		["en-US", "en"],
		["de-AT", "de"],
		["pt-BR", "pt"],
		["zh-Hant-TW", "zh"],
		["fr", "fr"],
	])("reads the language of %s", (locale, language) => {
		withLanguage(locale);

		expect(searchLanguage()).toBe(language);
	});

	it.each([[""], ["not a locale"]])(
		"falls back to English for %j",
		(locale) => {
			withLanguage(locale);

			expect(searchLanguage()).toBe("en");
		},
	);
});
