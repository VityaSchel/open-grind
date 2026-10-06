// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import DisplayName from "./DisplayName.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("DisplayName", () => {
	it("calls a nameless profile Someone", () => {
		const { container } = render(DisplayName, { props: { name: null } });

		expect(container.textContent).toBe("Someone");
	});

	it("prefers the caller's fallback", () => {
		const { container } = render(DisplayName, {
			props: { name: "", fallback: "Unnamed" },
		});

		expect(container.textContent).toBe("Unnamed");
	});

	it("renames the fallback when the locale changes", async () => {
		const { container } = render(DisplayName, { props: { name: null } });

		await setLocale({ locale: "en-XA" });

		expect(container.textContent).toMatch(PSEUDO_MESSAGE);
	});
});
