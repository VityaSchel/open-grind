import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { accountStatusState } from "$lib/api/account-status-state.svelte";
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
	clearAccountCaches();
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
			"This account isn’t registered with Grindr. Sign up in the official Grindr app first.",
	},
	{
		failure: "too many attempts",
		error: { kind: "RateLimited" },
		english: "Too many attempts. Try again later.",
	},
	{
		failure: "a failed Google OAuth app",
		error: { kind: "Auth", message: "companion-failed" },
		english: "Couldn’t sign in with Google",
	},
];

const companionMessages = [
	{
		verdict: "untrusted",
		message: untrustedCompanionMessage,
		english:
			"The installed Open Grind Google OAuth app isn’t signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.",
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
	it.each([
		[30, "Verification required", "phoneVerificationRequired"],
		[8, "The client version is deprecated", "unsupportedVersion"],
	])(
		"shows error %i in the account popup instead of a toast",
		(code, message, kind) => {
			reportSignInFailure({
				error: { kind: "Api", message: { code, message } },
			});

			expect(accountStatusState).toMatchObject({
				open: true,
				status: { kind },
			});
			expect(toastErrorMock).not.toHaveBeenCalled();
		},
	);

	it("keeps showing other API errors as a toast", () => {
		reportSignInFailure({
			error: {
				kind: "Api",
				message: { code: 4, message: "Wrong password" },
			},
		});

		expect(accountStatusState.open).toBe(false);
		expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
			"Error 4: Wrong password",
		);
	});

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
