import { afterEach, describe, expect, it, vi } from "vitest";

import { systemLanguage } from "$lib/util/language";

afterEach(() => {
	vi.restoreAllMocks();
});

function withLanguage(language: string) {
	vi.spyOn(navigator, "language", "get").mockReturnValue(language);
}

describe("systemLanguage", () => {
	it.each([
		["en-US", "en"],
		["de-AT", "de"],
		["pt-BR", "pt"],
		["zh-Hant-TW", "zh"],
		["fr", "fr"],
	])("reads the language of %s", (locale, language) => {
		withLanguage(locale);

		expect(systemLanguage()).toBe(language);
	});

	it.each([[""], ["not a locale"]])(
		"falls back to English for %j",
		(locale) => {
			withLanguage(locale);

			expect(systemLanguage()).toBe("en");
		},
	);
});
