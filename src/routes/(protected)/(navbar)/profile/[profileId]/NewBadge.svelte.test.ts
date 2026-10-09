// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import NewBadge from "./NewBadge.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("NewBadge", () => {
	it("marks a profile the server reports as new", () => {
		const { container } = render(NewBadge, { props: { isNew: true } });

		const badge = container.querySelector('[data-slot="new-badge"]');

		expect(badge?.textContent?.trim()).toBe("New");
		expect(badge?.getAttribute("title")).toBe("Joined recently");
	});

	it("renders nothing for a profile that is not new", () => {
		const { container } = render(NewBadge, { props: { isNew: false } });

		expect(container.textContent).toBe("");
	});

	it("words the badge in the active locale", async () => {
		render(NewBadge, { props: { isNew: true } });

		await setLocale({ locale: "en-XA" });

		const badge = slot("new-badge");
		expect(badge.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		expect(badge.title).toMatch(PSEUDO_MESSAGE);
	});
});
