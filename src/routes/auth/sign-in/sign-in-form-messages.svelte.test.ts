// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInFlowEnded, signInInProgress } from "$lib/api/sign-in";
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
	{ failure: "a missing reCAPTCHA helper", reason: "addonUnavailable" },
	{ failure: "an unexplained captcha failure", reason: "mintFailed" },
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

const facebookFailures = [
	{
		failure: "a Facebook dialog error",
		marker: "facebook-dialog-error",
		english:
			"Facebook didn’t grant access. Try again, or sign in with your email and password.",
	},
	{
		failure: "a Facebook app handoff",
		marker: "facebook-handoff-refused",
		english:
			"Facebook tried to open its own app, which Open Grind can’t use. Sign in with your email and password instead.",
	},
	{
		failure: "a Facebook redirect it can't verify",
		marker: "facebook-unverified",
		english: "Couldn’t verify the Facebook sign-in",
	},
	{
		failure: "a Facebook sign-in that timed out",
		marker: "facebook-timed-out",
		english: "Sign-in timed out",
	},
];

describe("SignInForm OAuth failures", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		gotoMock.mockReset();
		toastMock.error.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
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

	it.each(["Google", "Facebook"])(
		"says a %s sign-in is already in progress",
		async (vendor) => {
			callMethodMock.mockRejectedValue({
				kind: "Auth",
				message: signInInProgress,
			});
			render(SignInForm);

			await fireEvent.click(
				screen.getByRole("button", { name: `Sign in with ${vendor}` }),
			);
			await settle();

			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				`${vendor} sign-in already in progress`,
			);
		},
	);

	it.each(["Google", "Facebook"])(
		"explains a %s sign-in flow that ended unexpectedly",
		async (vendor) => {
			callMethodMock.mockRejectedValue({
				kind: "Auth",
				message: signInFlowEnded,
			});
			render(SignInForm);

			await fireEvent.click(
				screen.getByRole("button", { name: `Sign in with ${vendor}` }),
			);
			await settle();

			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Sign-in flow ended unexpectedly",
			);
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
	{
		failure: "a sign-in flow that ended unexpectedly",
		button: "Sign in with Google",
		rejects: {
			sign_in_with_google: { kind: "Auth", message: signInFlowEnded },
		},
		resolves: {},
	},
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

	it.each(["Google", "Facebook"])(
		"names the %s sign-in already in progress in the active locale",
		async (vendor) => {
			callMethodMock.mockRejectedValue({
				kind: "Auth",
				message: signInInProgress,
			});
			render(SignInForm);
			const target = screen.getByRole("button", {
				name: `Sign in with ${vendor}`,
			});
			await setLocale({ locale: "en-XA" });

			await fireEvent.click(target);
			await vi.waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledOnce();
			});

			const [message] = toastMock.error.mock.lastCall ?? [];
			expect(message).toMatch(PSEUDO_MESSAGE);
			expect(message).toContain(vendor);
		},
	);
});
