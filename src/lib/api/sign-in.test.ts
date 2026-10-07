import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastErrorMock } }));

const {
	disabledCompanionMessage,
	refusedCompanionMessage,
	reportSignInFailure,
	untrustedCompanionMessage,
} = await import("./sign-in");

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

const failures = [
	{
		failure: "an account Grindr doesn't know",
		error: { kind: "Auth", message: "account not registered" },
		english:
			"Account not registered in Grindr. Register first using the official Grindr app",
	},
	{
		failure: "too many attempts",
		error: { kind: "RateLimited" },
		english: "Too many attempts. Please try again later.",
	},
];

const companionMessages = [
	{
		verdict: "untrusted",
		message: untrustedCompanionMessage,
		english:
			"The installed Open Grind Google OAuth app isn't signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.",
	},
	{
		verdict: "refused",
		message: refusedCompanionMessage,
		english:
			"The Open Grind Google OAuth app only accepts official copies of Open Grind. Update it, or paste the OAuth token manually.",
	},
	{
		verdict: "disabled",
		message: disabledCompanionMessage,
		english:
			"The Open Grind Google OAuth app is turned off. Turn it on in Android settings, then try again.",
	},
];

describe("reportSignInFailure", () => {
	it.each(failures)("explains $failure", ({ error, english }) => {
		reportSignInFailure({ error });

		expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(english);
	});

	it.each(failures)(
		"explains $failure in the active locale",
		async ({ error }) => {
			await setLocale({ locale: "en-XA" });

			reportSignInFailure({ error });

			expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
				expect.stringMatching(PSEUDO_MESSAGE),
			);
		},
	);
});

describe("companion messages", () => {
	it.each(companionMessages)(
		"explains a $verdict Google OAuth app",
		async ({ message, english }) => {
			expect(message()).toBe(english);

			await setLocale({ locale: "en-XA" });

			expect(message()).toMatch(PSEUDO_MESSAGE);
		},
	);
});
