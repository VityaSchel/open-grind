// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

vi.mock("./sign-in/SignInForm.svelte", () => ({ default: () => {} }));
vi.mock("./sign-in/google/GoogleSignInForm.svelte", () => ({
	default: () => {},
}));
vi.mock("./password-reset/ForgotPasswordForm.svelte", () => ({
	default: () => {},
}));
vi.mock("./sign-up/RegisterForm.svelte", () => ({ default: () => {} }));

const pages = [
	{
		route: "/auth/sign-in",
		title: "Sign In",
		load: () => import("./sign-in/+page.svelte"),
	},
	{
		route: "/auth/sign-in/google",
		title: "Sign in with Google",
		load: () => import("./sign-in/google/+page.svelte"),
	},
	{
		route: "/auth/password-reset",
		title: "Password Reset",
		load: () => import("./password-reset/+page.svelte"),
	},
	{
		route: "/auth/sign-up",
		title: "Sign Up",
		load: () => import("./sign-up/+page.svelte"),
	},
];

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("auth pages", () => {
	it.each(pages)(
		"titles $route in the active locale",
		async ({ title, load }) => {
			const { default: page } = await load();
			render(page);

			expect(document.title).toBe(title);

			await setLocale({ locale: "en-XA" });

			expect(document.title).toMatch(PSEUDO_MESSAGE);
		},
	);
});
