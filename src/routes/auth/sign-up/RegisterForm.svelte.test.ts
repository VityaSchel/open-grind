// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import RegisterForm from "./RegisterForm.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("RegisterForm", () => {
	it("explains that registration is not implemented yet", () => {
		const { container, getByRole } = render(RegisterForm);

		expect(container.textContent).toBe(
			" Unimplemented Registration is not implemented yet, track #21. Sign In",
		);
		expect(getByRole("link", { name: "#21" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/21",
		);
	});

	it("names the sign-in page in the active locale", async () => {
		const { container } = render(RegisterForm);
		await setLocale({ locale: "en-XA" });

		const signIn = container.querySelector('a[href="/auth/sign-in"]');
		expect(signIn?.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});
});
