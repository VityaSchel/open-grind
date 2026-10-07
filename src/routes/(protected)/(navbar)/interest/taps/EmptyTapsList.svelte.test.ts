// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import EmptyTapsList from "./EmptyTapsList.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function emptyState(container: HTMLElement) {
	const title = container.querySelector('[data-slot="empty-title"]');
	const description = container.querySelector(
		'[data-slot="empty-description"]',
	);
	if (title === null || description === null) {
		throw new Error("EmptyTapsList has no title or description");
	}
	const links = [...description.children].filter(
		(child) => child instanceof HTMLAnchorElement,
	);
	expect(links).toHaveLength(1);
	const [link] = links;
	if (link === undefined) throw new Error("no Grid link");
	return { title, description, link };
}

describe("EmptyTapsList", () => {
	it("points to the grid to find people to tap", () => {
		const { container } = render(EmptyTapsList);

		const { link } = emptyState(container);
		expect(container.textContent).toBe(
			" No Taps Yet Browse Grid to find people, and they might tap you back.",
		);
		expect(link.getAttribute("href")).toBe("/");
		expect(link.textContent).toBe("Grid");
	});

	it("words the empty state and its link in the active locale", async () => {
		const { container } = render(EmptyTapsList);

		await setLocale({ locale: "en-XA" });

		const { title, description, link } = emptyState(container);
		expect(title.textContent).toMatch(PSEUDO_MESSAGE);
		expect(description.textContent).toMatch(PSEUDO_MESSAGE);
		expect(link.getAttribute("href")).toBe("/");
		expect(link.textContent).not.toBe("Grid");
		expect(description.textContent).toContain(` ${link.textContent} `);
		expect(description.textContent).not.toContain("Grid");
	});
});
