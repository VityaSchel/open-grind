// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { page } from "$app/state";
import { createRawSnippet, flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", async () => {
	const { SvelteURL } = await import("svelte/reactivity");
	return { page: { url: new SvelteURL("https://app.test/interest/taps") } };
});
vi.mock("./InterestPager.svelte", () => ({ default: () => {} }));

import { PSEUDO_TITLE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import InterestLayout from "./+layout.svelte";

function openInterest(pathname: string) {
	(page.url as URL).pathname = pathname;
	render(InterestLayout, {
		props: {
			data: { ourProfileId: 1 },
			params: {},
			children: createRawSnippet(() => ({ render: () => "<div></div>" })),
		},
	});
}

afterEach(async () => {
	cleanup();
	document.title = "";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("interest layout", () => {
	it.each([
		["/interest/taps", "Taps — Open Grind"],
		["/interest/views", "Views — Open Grind"],
	])("titles %s as %s, replacing the previous title", (pathname, title) => {
		document.title = "Edit Album — Open Grind";

		openInterest(pathname);

		expect(document.title).toBe(title);
	});

	it("follows the tab the pager settles on and the active locale", async () => {
		openInterest("/interest/taps");

		(page.url as URL).pathname = "/interest/views";
		flushSync();

		expect(document.title).toBe("Views — Open Grind");

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() => expect(document.title).toMatch(PSEUDO_TITLE));
	});
});
