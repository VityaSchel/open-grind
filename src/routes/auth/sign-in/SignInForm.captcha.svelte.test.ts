// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	addonMock,
	callMethodMock,
	expectReady,
	gotoMock,
	invalidCredentials,
	openExternalLinkMock,
	resetSignInMocks,
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
vi.mock("#lib/platform/link-opener.ts", async () => ({
	openExternalLink: (await import("./sign-in-form-test-helpers"))
		.openExternalLinkMock,
}));
vi.mock("#lib/updates/addon.svelte.ts", async (importOriginal) => {
	const { addonMock } = await import("./sign-in-form-test-helpers");
	return {
		...(await importOriginal<
			typeof import("#lib/updates/addon.svelte.ts")
		>()),
		addonInstallerAvailable: addonMock.addonInstallerAvailable,
		addonPublishedHere: addonMock.addonPublishedHere,
		recaptchaUpdates: { installNow: addonMock.installNow },
	};
});

async function rejectMint(reason: string) {
	callMethodMock
		.mockRejectedValueOnce(invalidCredentials)
		.mockResolvedValueOnce(true)
		.mockRejectedValueOnce({ kind: "Recaptcha", message: { reason } });
	render(SignInForm);
	await submitSignIn();
}

async function retryWithCaptcha(failure: unknown) {
	callMethodMock
		.mockRejectedValueOnce(invalidCredentials)
		.mockResolvedValueOnce(true)
		.mockResolvedValueOnce("captcha-token")
		.mockRejectedValueOnce(failure);
	render(SignInForm);
	await submitSignIn();
}

function helperDialog() {
	return screen.findByRole("alertdialog", {
		name: "Install reCAPTCHA helper",
	});
}

function expectGuideToast(message: string) {
	expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(message, {
		action: { label: "Learn more", onClick: expect.any(Function) },
	});
	const [[, options]] = toastMock.error.mock.calls as [
		[string, { action: { onClick: () => void } }],
	];
	options.action.onClick();
	expect(openExternalLinkMock).toHaveBeenCalledExactlyOnceWith(
		"https://opengrind.org/guides/recaptcha-helper",
	);
}

describe("SignInForm CAPTCHA retry", () => {
	beforeEach(resetSignInMocks);

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

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

	it("obtains a login CAPTCHA without consulting the assignment when Grindr asks for one", async () => {
		callMethodMock
			.mockRejectedValueOnce({
				kind: "Api",
				message: { code: 18, message: "Invalid captcha token" },
			})
			.mockResolvedValueOnce("captcha-token")
			.mockResolvedValueOnce({ profileId: 456 })
			.mockResolvedValueOnce("keyring");
		render(SignInForm);

		await submitSignIn();

		expect(callMethodMock.mock.calls.map(([method]) => method)).toEqual([
			"sign_in_with_email",
			"mint_recaptcha_token",
			"sign_in_with_email",
			"storage_backend",
		]);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/");
		expect(toastMock.error).not.toHaveBeenCalled();
		expectReady();
	});

	it.each([
		[
			"addonDisabled",
			"Enable the Open Grind reCAPTCHA helper to sign in to this account.",
		],
		[
			"addonUntrusted",
			"The installed reCAPTCHA helper isn't the official Open Grind build.",
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
		[
			"unsupportedPlatform",
			"Wrong email or password, or Grindr wants a captcha check, which needs the reCAPTCHA helper on Android.",
		],
		[
			"grindrMissing",
			"The reCAPTCHA helper needs the official Grindr app installed to verify this sign-in.",
		],
	])(
		"points the CAPTCHA helper's %s result to the helper guide",
		async (reason, message) => {
			await rejectMint(reason);

			expect(callMethodMock).toHaveBeenCalledTimes(3);
			expectGuideToast(message);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it("offers to install a missing CAPTCHA helper", async () => {
		await rejectMint("addonUnavailable");
		const dialog = await helperDialog();

		expect(dialog.textContent.replace(/\s+/g, " ")).toContain(
			"Wrong email or password, or Grindr wants a captcha check. The check needs the reCAPTCHA helper add-on for Open Grind and the official Grindr app installed.",
		);
		expect(toastMock.error).not.toHaveBeenCalled();
		await fireEvent.click(
			within(dialog).getByRole("button", { name: "Continue" }),
		);

		await waitFor(() =>
			expect(addonMock.installNow).toHaveBeenCalledOnce(),
		);
		expect(addonMock.addonPublishedHere).toHaveBeenCalledExactlyOnceWith(
			"recaptcha",
		);
		expect(openExternalLinkMock).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expectReady();
	});

	it.each([
		[
			"the add-on installer is unavailable",
			() => addonMock.addonInstallerAvailable.mockReturnValue(false),
		],
		[
			"no helper build is published for this device",
			() => addonMock.addonPublishedHere.mockResolvedValue(false),
		],
	])(
		"sends a missing CAPTCHA helper to its releases when %s",
		async (_name, arrange) => {
			arrange();
			await rejectMint("addonUnavailable");

			await fireEvent.click(
				within(await helperDialog()).getByRole("button", {
					name: "Continue",
				}),
			);

			await waitFor(() =>
				expect(openExternalLinkMock).toHaveBeenCalledExactlyOnceWith(
					"https://git.opengrind.org/open-grind/recaptcha-helper/releases",
				),
			);
			expect(addonMock.installNow).not.toHaveBeenCalled();
		},
	);

	it("leaves a missing CAPTCHA helper alone when the install is cancelled", async () => {
		await rejectMint("addonUnavailable");

		await fireEvent.click(
			within(await helperDialog()).getByRole("button", {
				name: "Cancel",
			}),
		);

		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expect(addonMock.installNow).not.toHaveBeenCalled();
		expect(openExternalLinkMock).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it.each([
		[
			invalidCredentials,
			"Wrong email or password, or Grindr rejected the reCAPTCHA helper's check.",
		],
		[
			{ kind: "Unauthorized" },
			"Wrong email or password, or Grindr rejected the reCAPTCHA helper's check.",
		],
		[
			{
				kind: "Api",
				message: { code: 18, message: "Invalid captcha token" },
			},
			"Grindr rejected the reCAPTCHA helper's check.",
		],
	])(
		"explains a refused CAPTCHA retry exactly once (%j)",
		async (failure, message) => {
			await retryWithCaptcha(failure);

			expect(callMethodMock).toHaveBeenCalledTimes(4);
			expectGuideToast(message);
			expect(gotoMock).not.toHaveBeenCalled();
			expectReady();
		},
	);

	it("reports an ordinary failure of the CAPTCHA retry exactly once", async () => {
		await retryWithCaptcha({
			kind: "Api",
			message: { code: 9, message: "Something broke" },
		});

		expect(callMethodMock).toHaveBeenCalledTimes(4);
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Error 9: Something broke",
		);
		expectReady();
	});
});
