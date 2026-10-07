// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import {
	refusedCompanionMessage,
	untrustedCompanionMessage,
} from "$lib/api/sign-in";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import SignInForm from "./SignInForm.svelte";

const { callMethodMock, gotoMock, toastMock } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	gotoMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const invalidCredentials = {
	kind: "Api",
	message: { code: 4, message: "Invalid input parameters" },
};

const captchaFailures = [
	{
		failure: "a missing reCAPTCHA helper",
		reason: "addonUnavailable",
		english:
			"Install the Open Grind reCAPTCHA helper to sign in to this account.",
	},
	{
		failure: "an unexplained captcha failure",
		reason: "mintFailed",
		english: "Captcha verification failed. Try again.",
	},
];

function refuseCaptcha(reason: string) {
	return {
		rejects: {
			sign_in_with_email: invalidCredentials,
			mint_recaptcha_token: { kind: "Recaptcha", message: { reason } },
		},
		resolves: { recaptcha_first_party_enabled: true },
	};
}

function answer({
	rejects,
	resolves,
}: {
	rejects: Record<string, unknown>;
	resolves: Record<string, unknown>;
}) {
	const outcomes = new Map<string, () => Promise<unknown>>([
		...Object.entries(rejects).map(
			([method, reason]) =>
				[method, vi.fn().mockRejectedValue(reason)] as const,
		),
		...Object.entries(resolves).map(
			([method, value]) =>
				[method, vi.fn().mockResolvedValue(value)] as const,
		),
	]);
	callMethodMock.mockImplementation((method: string) =>
		outcomes.get(method)?.(),
	);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function submitSignIn() {
	await fireEvent.input(screen.getByLabelText("Email"), {
		target: { value: "someone@example.com" },
	});
	await fireEvent.input(screen.getByLabelText("Password"), {
		target: { value: "hunter2" },
	});
	await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
	await settle();
}

const facebookFailures = [
	{
		failure: "a Facebook dialog error",
		marker: "facebook-dialog-error",
		english:
			"Facebook didn't grant access. Try again, or sign in with your email and password.",
	},
	{
		failure: "a Facebook app handoff",
		marker: "facebook-handoff-refused",
		english:
			"Facebook tried to open its own app, which Open Grind can't use. Sign in with your email and password instead.",
	},
	{
		failure: "a Facebook redirect it can't verify",
		marker: "facebook-unverified",
		english: "Sign-in could not be verified",
	},
	{
		failure: "a Facebook sign-in that timed out",
		marker: "facebook-timed-out",
		english: "Sign-in timed out",
	},
];

describe("SignInForm", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		gotoMock.mockReset();
		toastMock.error.mockReset();
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
	});

	it("raises the dialog instead of a toast when Cloudflare blocks the sign-in", async () => {
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SignInForm);

		await submitSignIn();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("cloudflare");
		expect(toastMock.error).not.toHaveBeenCalled();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("raises the dialog instead of a toast when an edge blocks the sign-in", async () => {
		callMethodMock.mockRejectedValue({ kind: "NetworkBlocked" });
		render(SignInForm);

		await submitSignIn();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("network");
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("falls back to a toast when the dialog is muted for the session", async () => {
		requestBlockedAlertState.disable = true;
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SignInForm);

		await submitSignIn();

		expect(requestBlockedAlertState.open).toBe(false);
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Grindr is blocking your requests",
		);
	});

	it("raises the dialog instead of a toast when a block kills Google sign-in", async () => {
		callMethodMock.mockRejectedValue({ kind: "RequestBlocked" });
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it.each(["Google", "Facebook"])(
		"names the official app when %s sign-in hits an unregistered account",
		async (vendor) => {
			callMethodMock.mockRejectedValue({
				kind: "Auth",
				message: "account not registered",
			});
			render(SignInForm);

			await fireEvent.click(
				screen.getByRole("button", { name: `Sign in with ${vendor}` }),
			);
			await settle();

			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Account not registered in Grindr. Register first using the official Grindr app",
			);
			expect(gotoMock).not.toHaveBeenCalled();
		},
	);

	it("falls back to a toast when a muted block kills Google sign-in", async () => {
		requestBlockedAlertState.disable = true;
		callMethodMock.mockRejectedValue({ kind: "NetworkBlocked" });
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Something blocked the request before it reached Grindr",
		);
	});

	it("sends a missing Google OAuth app to the Google sign-in screen", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google",
		);
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("stays on the sign-in screen when the Google OAuth app is turned off", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-disabled",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"The Open Grind Google OAuth app is turned off. Turn it on in Android settings, then try again.",
		);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("sends an untrusted Google OAuth app straight to the pasted token", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-untrusted",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			untrustedCompanionMessage(),
		);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google?paste",
		);
	});

	it("sends a Google OAuth app that refuses this build straight to the pasted token", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-refused",
		});
		render(SignInForm);

		await fireEvent.click(
			screen.getByRole("button", { name: "Sign in with Google" }),
		);
		await settle();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			refusedCompanionMessage(),
		);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google?paste",
		);
	});

	it.each(facebookFailures)(
		"explains $failure",
		async ({ marker, english }) => {
			callMethodMock.mockRejectedValue({ kind: "Auth", message: marker });
			render(SignInForm);

			await fireEvent.click(
				screen.getByRole("button", { name: "Sign in with Facebook" }),
			);
			await settle();

			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(english);
			expect(gotoMock).not.toHaveBeenCalled();
		},
	);

	it("keeps the password button's name while it signs in", async () => {
		callMethodMock.mockReturnValue(new Promise(() => {}));
		render(SignInForm);

		await submitSignIn();

		const busy = screen.getByRole("button", { name: "Sign in" });
		expect(busy.getAttribute("aria-busy")).toBe("true");
		expect(
			screen
				.getByRole("button", { name: "Sign in with Google" })
				.getAttribute("aria-busy"),
		).toBe("false");
	});

	it.each(["Google", "Facebook"])(
		"keeps the %s button's name while it signs in",
		async (vendor) => {
			callMethodMock.mockReturnValue(new Promise(() => {}));
			render(SignInForm);
			const name = `Sign in with ${vendor}`;

			await fireEvent.click(screen.getByRole("button", { name }));
			await settle();

			const busy = screen.getByRole("button", { name });
			expect(busy).toHaveProperty("disabled", true);
			expect(busy.getAttribute("aria-busy")).toBe("true");
			expect(screen.queryByRole("status")).toBeNull();
		},
	);

	it("still reports an ordinary API failure", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Api",
			message: { code: 9, message: "Something broke" },
		});
		render(SignInForm);

		await submitSignIn();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Error 9: Something broke",
		);
	});

	it("still reports wrong credentials", async () => {
		callMethodMock.mockRejectedValue({
			kind: "Api",
			message: { code: 4, message: "Invalid input parameters" },
		});
		render(SignInForm);

		await submitSignIn();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Invalid email or password",
		);
	});

	it.each(captchaFailures)(
		"explains $failure",
		async ({ reason, english }) => {
			answer(refuseCaptcha(reason));
			render(SignInForm);

			await submitSignIn();
			await vi.waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledOnce();
			});

			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(english);
		},
	);
});

const localizedFailures = [
	{
		failure: "wrong credentials",
		button: "Sign in",
		rejects: { sign_in_with_email: invalidCredentials },
		resolves: { recaptcha_first_party_enabled: false },
	},
	{
		failure: "wrong credentials after a captcha",
		button: "Sign in",
		rejects: { sign_in_with_email: invalidCredentials },
		resolves: {
			recaptcha_first_party_enabled: true,
			mint_recaptcha_token: "token",
		},
	},
	...captchaFailures.map(({ failure, reason }) => ({
		failure,
		button: "Sign in",
		...refuseCaptcha(reason),
	})),
	...facebookFailures.map(({ failure, marker }) => ({
		failure,
		button: "Sign in with Facebook",
		rejects: { sign_in_with_facebook: { kind: "Auth", message: marker } },
		resolves: {},
	})),
];

describe("SignInForm in the active locale", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		toastMock.error.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(async () => {
		cleanup();
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("renders its copy in the active locale", async () => {
		const { container } = render(SignInForm);
		await setLocale({ locale: "en-XA" });

		const header = [
			...container.querySelectorAll(
				'[data-slot="card-title"], [data-slot="card-description"]',
			),
		].map((node) => node.textContent.trim());
		expect(header).toHaveLength(2);
		for (const text of header) expect(text).toMatch(PSEUDO_MESSAGE);
		expect(
			screen.getAllByRole("link", { name: PSEUDO_MESSAGE }),
		).toHaveLength(2);
		expect(screen.getAllByLabelText(PSEUDO_MESSAGE)).toHaveLength(2);
		expect(
			screen.getAllByRole("button", { name: PSEUDO_MESSAGE }),
		).toHaveLength(3);
		expect(
			screen.getByLabelText(PSEUDO_MESSAGE, { selector: "#email" }),
		).toHaveProperty("placeholder", expect.stringMatching(PSEUDO_MESSAGE));
	});

	it.each(localizedFailures)(
		"explains $failure in the active locale",
		async ({ button, rejects, resolves }) => {
			answer({ rejects, resolves });
			render(SignInForm);
			const email = screen.getByLabelText("Email");
			const password = screen.getByLabelText("Password");
			const target = screen.getByRole("button", { name: button });
			await setLocale({ locale: "en-XA" });

			await fireEvent.input(email, {
				target: { value: "someone@example.com" },
			});
			await fireEvent.input(password, { target: { value: "hunter2" } });
			await fireEvent.click(target);
			await vi.waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledOnce();
			});

			expect(toastMock.error).toHaveBeenCalledWith(
				expect.stringMatching(PSEUDO_MESSAGE),
			);
		},
	);

	it("names the provider whose sign-in failed in the active locale", async () => {
		callMethodMock.mockRejectedValue(new Error("boom"));
		render(SignInForm);
		const google = screen.getByRole("button", {
			name: "Sign in with Google",
		});
		await setLocale({ locale: "en-XA" });

		await fireEvent.click(google);
		await vi.waitFor(() => {
			expect(toastMock.error).toHaveBeenCalledOnce();
		});

		const [label] = toastMock.error.mock.lastCall ?? [];
		expect(label).toMatch(PSEUDO_MESSAGE);
		expect(label).toContain("Google");
	});
});
