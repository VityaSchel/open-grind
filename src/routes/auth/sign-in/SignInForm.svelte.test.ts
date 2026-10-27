// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { accountStatusState } from "$lib/api/account-status-state.svelte";
import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import {
	refusedCompanionMessage,
	untrustedCompanionMessage,
} from "$lib/api/sign-in";
import {
	clearProfileCaches,
	getProfile,
	isProfileCached,
} from "$lib/api/users/profiles";
import SignInForm from "./SignInForm.svelte";

const { callMethodMock, fetchRestMock, gotoMock, toastMock } = vi.hoisted(
	() => ({
		fetchRestMock: vi.fn(),
		callMethodMock: vi.fn(),
		gotoMock: vi.fn(),
		toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
	}),
);

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

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

const invalidCredentials = {
	kind: "Api",
	message: { code: 4, message: "Invalid input parameters" },
};

async function cachePreviousProfile() {
	fetchRestMock.mockResolvedValue({
		jsonParsed: (schema: ZodType) =>
			schema.parse({
				profiles: [
					{
						profileId: 123,
						displayName: "Previous account",
						age: 25,
					},
				],
			}),
	});
	await getProfile(123);
	expect(isProfileCached(123)).toBe(true);
}

function expectReady() {
	const button = screen.getByRole("button", { name: "Sign in" });
	expect(button).toHaveProperty("disabled", false);
	expect(button.getAttribute("aria-busy")).toBe("false");
}

describe("SignInForm", () => {
	beforeEach(() => {
		callMethodMock.mockReset();
		fetchRestMock.mockReset();
		clearProfileCaches();
		accountStatusState.open = false;
		accountStatusState.status = null;
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
		clearProfileCaches();
		accountStatusState.open = false;
		accountStatusState.status = null;
		vi.restoreAllMocks();
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
			untrustedCompanionMessage,
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
			refusedCompanionMessage,
		);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			"/auth/sign-in/google?paste",
		);
	});

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

	it.each(["Email", "Google", "Facebook"])(
		"completes %s sign-in and drops the previous profile before navigating",
		async (vendor) => {
			await cachePreviousProfile();
			let profileCachedAtNavigation: boolean | undefined;
			gotoMock.mockImplementation(() => {
				profileCachedAtNavigation = isProfileCached(123);
			});
			callMethodMock
				.mockResolvedValueOnce({ profileId: 456 })
				.mockResolvedValueOnce("keyring");
			render(SignInForm);

			if (vendor === "Email") await submitSignIn();
			else {
				await fireEvent.click(
					screen.getByRole("button", {
						name: `Sign in with ${vendor}`,
					}),
				);
				await settle();
			}

			expect(callMethodMock.mock.calls[0]).toEqual(
				vendor === "Email"
					? [
							"sign_in_with_email",
							{
								email: "someone@example.com",
								password: "hunter2",
								captchaToken: undefined,
							},
						]
					: [`sign_in_with_${vendor.toLowerCase()}`],
			);
			expect(callMethodMock).toHaveBeenCalledTimes(2);
			expect(callMethodMock).toHaveBeenLastCalledWith("storage_backend");
			expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/");
			expect(profileCachedAtNavigation).toBe(false);
			expect(toastMock.error).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it("shows an account restriction instead of entering the app", async () => {
		const restriction = { kind: "ageVerification", region: "GB" };
		callMethodMock.mockResolvedValueOnce({ profileId: 456, restriction });
		render(SignInForm);

		await submitSignIn();

		expect(accountStatusState.open).toBe(true);
		expect(accountStatusState.status).toEqual({
			kind: "restriction",
			restriction,
		});
		expect(callMethodMock).toHaveBeenCalledOnce();
		expect(gotoMock).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
		expectReady();
	});

	it.each([invalidCredentials, { kind: "Unauthorized" }])(
		"obtains a login CAPTCHA and retries rejected credentials (%j)",
		async (failure) => {
			await cachePreviousProfile();
			callMethodMock
				.mockRejectedValueOnce(failure)
				.mockResolvedValueOnce(true)
				.mockResolvedValueOnce("captcha-token")
				.mockResolvedValueOnce({ profileId: 456 })
				.mockResolvedValueOnce("keyring");
			render(SignInForm);

			await submitSignIn();

			expect(callMethodMock.mock.calls).toEqual([
				[
					"sign_in_with_email",
					{
						email: "someone@example.com",
						password: "hunter2",
						captchaToken: undefined,
					},
				],
				["recaptcha_first_party_enabled"],
				["mint_recaptcha_token", { action: "login" }],
				[
					"sign_in_with_email",
					{
						email: "someone@example.com",
						password: "hunter2",
						captchaToken: "captcha-token",
					},
				],
				["storage_backend"],
			]);
			expect(isProfileCached(123)).toBe(false);
			expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/");
			expect(toastMock.error).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it.each([
		["disabled", false],
		["check failed", new Error("Assignment check failed")],
	])(
		"reports wrong credentials when the CAPTCHA assignment is unavailable (%s)",
		async (_name, assignment) => {
			callMethodMock.mockRejectedValueOnce(invalidCredentials);
			if (assignment === false)
				callMethodMock.mockResolvedValueOnce(false);
			else callMethodMock.mockRejectedValueOnce(assignment);
			render(SignInForm);

			await submitSignIn();

			expect(callMethodMock).toHaveBeenCalledTimes(2);
			expect(callMethodMock).toHaveBeenLastCalledWith(
				"recaptcha_first_party_enabled",
			);
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Invalid email or password",
			);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it.each([
		[
			"unsupportedPlatform",
			"This account needs captcha verification, available through the Open Grind reCAPTCHA helper on Android.",
		],
		[
			"addonUnavailable",
			"Install the Open Grind reCAPTCHA helper to sign in to this account.",
		],
		[
			"addonDisabled",
			"Enable the Open Grind reCAPTCHA helper to sign in to this account.",
		],
		[
			"addonUntrusted",
			"The installed reCAPTCHA helper isn't the official Open Grind build.",
		],
		[
			"grindrMissing",
			"The reCAPTCHA helper needs the Grindr app installed to verify this sign-in.",
		],
		["failed", "Captcha verification failed. Try again."],
		["cancelled", null],
	])(
		"handles the CAPTCHA helper's %s result without retrying",
		async (reason, message) => {
			callMethodMock
				.mockRejectedValueOnce(invalidCredentials)
				.mockResolvedValueOnce(true)
				.mockRejectedValueOnce({
					kind: "Recaptcha",
					message: { reason },
				});
			render(SignInForm);

			await submitSignIn();

			expect(callMethodMock).toHaveBeenCalledTimes(3);
			expect(callMethodMock).toHaveBeenLastCalledWith(
				"mint_recaptcha_token",
				{ action: "login" },
			);
			if (message === null)
				expect(toastMock.error).not.toHaveBeenCalled();
			else
				expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
					message,
				);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it.each([
		[invalidCredentials, "Invalid email or password"],
		[{ kind: "Unauthorized" }, "Invalid email or password"],
		[
			{ kind: "Api", message: { code: 9, message: "Something broke" } },
			"Error 9: Something broke",
		],
	])(
		"reports a failed CAPTCHA retry exactly once (%j)",
		async (failure, message) => {
			callMethodMock
				.mockRejectedValueOnce(invalidCredentials)
				.mockResolvedValueOnce(true)
				.mockResolvedValueOnce("captcha-token")
				.mockRejectedValueOnce(failure);
			render(SignInForm);

			await submitSignIn();

			expect(callMethodMock).toHaveBeenCalledTimes(4);
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(message);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it.each(["Google", "Facebook"])(
		"silently restores the form after cancelled %s sign-in",
		async (vendor) => {
			callMethodMock.mockRejectedValueOnce({
				kind: "Auth",
				message: "Sign-in canceled",
			});
			render(SignInForm);

			await fireEvent.click(
				screen.getByRole("button", { name: `Sign in with ${vendor}` }),
			);
			await settle();

			expect(toastMock.error).not.toHaveBeenCalled();
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
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
});
