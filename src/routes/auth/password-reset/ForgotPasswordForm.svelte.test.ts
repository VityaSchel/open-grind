// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import ForgotPasswordForm from "./ForgotPasswordForm.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("ForgotPasswordForm", () => {
	it("explains that password reset is not implemented yet", () => {
		const { container, getByRole } = render(ForgotPasswordForm);

		expect(container.textContent).toBe(
			" Unimplemented Password reset is not implemented yet, track #22. Sign In",
		);
		expect(getByRole("link", { name: "#22" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/22",
		);
	});

	it("names the sign-in page in the active locale", async () => {
		const { container } = render(ForgotPasswordForm);
		await setLocale({ locale: "en-XA" });

		const signIn = container.querySelector('a[href="/auth/sign-in"]');
		expect(signIn?.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});
});
