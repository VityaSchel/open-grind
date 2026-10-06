// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/missing") },
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import NotFound from "./NotFound.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

async function openClippy(container: HTMLElement) {
	const anchor = container.querySelector('[role="button"]');
	if (!anchor) throw new Error("NotFound has no Clippy anchor");
	await fireEvent.pointerDown(anchor);
	return vi.waitFor(() => {
		const items = [
			...document.querySelectorAll('[data-slot="tooltip-content"] li'),
		];
		expect(items).toHaveLength(3);
		return items;
	});
}

describe("NotFound", () => {
	it("explains the missing page and offers the way home", () => {
		const { container } = render(NotFound);

		expect(container.textContent).toBe(
			"   Page not found The page you are looking for does not exist. Go to home page Report an issue ",
		);
		expect(container.querySelector("img")?.getAttribute("alt")).toBe(
			"Clippy",
		);
	});

	it("lets Clippy promise what it would never do", async () => {
		const { container } = render(NotFound);

		await openClippy(container);

		expect(
			document.querySelector('[data-slot="tooltip-content"]')
				?.textContent,
		).toBe(
			"It looks like you're a little lost.  Would you like help?  Don't worry, Clippy would never Sell your information Add AI age verification Exploit troubled queers ",
		);
	});

	it("renders every line in the active locale", async () => {
		const { container } = render(NotFound);
		await setLocale({ locale: "en-XA" });

		const items = await openClippy(container);

		const lines = [
			...container.querySelectorAll(
				'[data-slot="empty-title"], [data-slot="empty-description"], a',
			),
			...document.querySelectorAll('[data-slot="tooltip-content"] p'),
			...items,
		].map((line) => line.textContent.trim());
		expect(lines).toHaveLength(9);
		for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);
		expect(container.querySelector("img")?.getAttribute("alt")).toMatch(
			PSEUDO_MESSAGE,
		);
	});
});
