// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { accountStatusState } from "#lib/api/account-status-state.svelte.ts";
import { requestBlockedAlertState } from "#lib/api/request-blocked-state.svelte.ts";
import {
	refusedCompanionMessage,
	untrustedCompanionMessage,
} from "#lib/api/sign-in.ts";
import {
	clearProfileCaches,
	getProfile,
	isProfileCached,
} from "#lib/api/users/profiles.ts";
import {
	callMethodMock,
	expectReady,
	fetchRestMock,
	gotoMock,
	invalidCredentials,
	resetSignInMocks,
	settle,
	submitSignIn,
	toastMock,
} from "./sign-in-form-test-helpers";
import SignInForm from "./SignInForm.svelte";

vi.mock("$app/navigation", async () => ({
	goto: (await import("./sign-in-form-test-helpers")).gotoMock,
}));
vi.mock("#lib/api/methods.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/methods.ts")>()),
	callMethod: (await import("./sign-in-form-test-helpers")).callMethodMock,
}));
vi.mock("svelte-sonner", async () => ({
	toast: (await import("./sign-in-form-test-helpers")).toastMock,
}));
vi.mock("#lib/api/transport.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/transport.ts")>()),
	fetchRest: (await import("./sign-in-form-test-helpers")).fetchRestMock,
}));

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

describe("SignInForm", () => {
	beforeEach(() => {
		resetSignInMocks();
		clearProfileCaches();
		accountStatusState.open = false;
		accountStatusState.status = null;
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
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
