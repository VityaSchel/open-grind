// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn() }));

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import BackLink from "./BackLink.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function linkLabels() {
	return screen
		.getAllByRole("link")
		.map((link) => link.getAttribute("aria-label"));
}

function renderBoth() {
	render(BackLink, { props: { href: "/" } });
	render(BackLink, { props: { href: "/chat", label: "Back to chats" } });
}

describe("BackLink", () => {
	it("is named Back unless its caller names it", () => {
		renderBoth();

		expect(linkLabels()).toEqual(["Back", "Back to chats"]);
	});

	it("renames its own label when the locale changes and keeps the caller's", async () => {
		renderBoth();

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() =>
			expect(linkLabels()).toEqual([
				t("shell.backLink.a11y.label"),
				"Back to chats",
			]),
		);
		expect(linkLabels()[0]).toMatch(PSEUDO_MESSAGE);
	});
});
