// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import LanguageSetting from "./LanguageSetting.svelte";

function shownLanguage(): HTMLElement {
	const current = document.querySelector<HTMLElement>(
		'[data-slot="language-setting-current"]',
	);
	if (current === null) throw new Error("No language is shown");
	return current;
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("LanguageSetting", () => {
	it("links to the Language page and names the language in itself", () => {
		render(LanguageSetting);

		const link = screen.getByRole("link", { name: "Language English" });
		expect(link.getAttribute("href")).toBe("/settings/app/language");
		expect(shownLanguage().textContent.trim()).toBe("English");
		expect(shownLanguage().getAttribute("lang")).toBe("en");
		expect(shownLanguage().getAttribute("translate")).toBe("no");
	});

	it.each([
		{ locale: "de-AT", own: "Deutsch", catalog: "de" },
		{ locale: "es-MX", own: "Español (Latinoamérica)", catalog: "es-419" },
		{ locale: "pt-AO", own: "Português (Portugal)", catalog: "pt-PT" },
		{ locale: "en-XM", own: "English", catalog: "en-XM" },
	])(
		"names the $catalog catalog that $locale shows",
		async ({ locale, own, catalog }) => {
			render(LanguageSetting);

			await setLocale({ locale });

			expect(shownLanguage().textContent.trim()).toBe(own);
			expect(shownLanguage().getAttribute("lang")).toBe(catalog);
		},
	);

	it("words its label in the active language", async () => {
		render(LanguageSetting);
		const label = screen.getByText("Language");

		await setLocale({ locale: "en-XA" });

		expect(label.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		expect(shownLanguage().textContent.trim()).toBe(
			"English (Pseudo-Accents)",
		);
	});
});
