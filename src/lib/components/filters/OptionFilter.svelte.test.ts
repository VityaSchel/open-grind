// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { optionFilters } from "./option-filters";
import OptionFilter from "./OptionFilter.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("OptionFilter", () => {
	it("words its label and the unspecified choice in the active locale", async () => {
		render(OptionFilter, {
			props: {
				filter: optionFilters.bodyTypes,
				checked: true,
				value: [],
			},
		});
		const field = screen.getByRole("checkbox", { name: "Body Type" });
		const notSpecified = screen.getByRole("button", {
			name: "Not specified",
		});

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("checkbox", { name: PSEUDO_MESSAGE })).toBe(
			field,
		);
		expect(notSpecified.textContent).toMatch(PSEUDO_MESSAGE);
	});
});
