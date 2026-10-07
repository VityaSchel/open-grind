// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import EmptyViewsGrid from "./EmptyViewsGrid.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function lines(container: HTMLElement): string[] {
	return [
		...container.querySelectorAll(
			'[data-slot="empty-title"], [data-slot="empty-description"]',
		),
	].map((line) => line.textContent);
}

describe("EmptyViewsGrid", () => {
	it("promises that profile viewers show up here", () => {
		const { container } = render(EmptyViewsGrid);

		expect(container.textContent).toBe(
			" No Views Yet When someone views your profile, they'll show up here.",
		);
	});

	it("words the empty state in the active locale", async () => {
		const { container } = render(EmptyViewsGrid);

		await setLocale({ locale: "en-XA" });

		const shown = lines(container);
		expect(shown).toHaveLength(2);
		for (const line of shown) expect(line).toMatch(PSEUDO_MESSAGE);
	});
});
