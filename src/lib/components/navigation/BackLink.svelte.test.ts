// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BeforeNavigate } from "$app/navigation";

const { beforeNavigate, goto } = vi.hoisted(() => ({
	beforeNavigate:
		vi.fn<(callback: (navigation: BeforeNavigate) => void) => void>(),
	goto: vi.fn(() => Promise.resolve()),
}));

vi.mock("$app/navigation", () => ({
	afterNavigate: vi.fn(),
	beforeNavigate,
	goto,
}));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE, t } from "#lib/i18n/index.ts";
import BackLink from "./BackLink.svelte";

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

function linkLabels() {
	return screen
		.getAllByRole("link")
		.map((link) => link.getAttribute("aria-label"));
}

function renderBoth() {
	render(BackLink, { props: { href: "/" } });
	render(BackLink, { props: { href: "/chat", label: "Back to Inbox" } });
}

describe("BackLink", () => {
	it("is named Back unless its caller names it", () => {
		renderBoth();

		expect(linkLabels()).toEqual(["Back", "Back to Inbox"]);
	});

	it("renames its own label when the locale changes and keeps the caller's", async () => {
		renderBoth();

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() =>
			expect(linkLabels()).toEqual([
				t("shell.backLink.a11y.label"),
				"Back to Inbox",
			]),
		);
		expect(linkLabels()[0]).toMatch(PSEUDO_MESSAGE);
	});

	it("ignores a second tap while it goes back", async () => {
		render(BackLink, { props: { href: "/settings" } });
		const back = screen.getByRole("link", { name: "Back" });

		await fireEvent.click(back);
		await fireEvent.click(back);

		expect(goto).toHaveBeenCalledExactlyOnceWith("/settings", {
			replace: true,
		});
	});

	it("goes back again once its navigation is cancelled", async () => {
		render(BackLink, { props: { href: "/settings" } });
		const back = screen.getByRole("link", { name: "Back" });
		await fireEvent.click(back);

		const complete = Promise.reject(new Error("navigation cancelled"));
		for (const [callback] of beforeNavigate.mock.calls)
			callback({ complete } as unknown as BeforeNavigate);
		await Promise.resolve();
		await fireEvent.click(back);

		expect(goto).toHaveBeenCalledTimes(2);
	});
});
