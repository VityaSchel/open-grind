import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastError, promptCopyError } = vi.hoisted(() => ({
	toastError: vi.fn(),
	promptCopyError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));
vi.mock("$lib/api/error-copy", () => ({ promptCopyError }));

import { clearAccountCaches } from "$lib/api/account-caches";
import { accountStatusState } from "$lib/api/account-status-state.svelte";
import { reportSignInFailure } from "$lib/api/sign-in";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	clearAccountCaches();
});

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
			expect(toastError).not.toHaveBeenCalled();
		},
	);

	it("names the sign-in page it couldn't show and keeps the reason for Copy details", () => {
		const error = {
			kind: "Auth",
			message:
				"Couldn't show the sign-in page: UIKit refused the presentation",
		};

		reportSignInFailure({ error });

		expect(toastError).toHaveBeenCalledExactlyOnceWith(
			"Couldn't show the sign-in page",
			expect.objectContaining({
				action: expect.objectContaining({ label: "Copy details" }),
			}),
		);
		toastError.mock.calls[0]?.[1].action.onClick();
		expect(promptCopyError).toHaveBeenCalledExactlyOnceWith(error);
	});

	it("stays quiet when the person cancels the sign-in page", () => {
		reportSignInFailure({
			error: { kind: "Auth", message: "Sign-in canceled" },
		});

		expect(toastError).not.toHaveBeenCalled();
	});

	it("keeps showing other API errors as a toast", () => {
		reportSignInFailure({
			error: {
				kind: "Api",
				message: { code: 4, message: "Wrong password" },
			},
		});

		expect(accountStatusState.open).toBe(false);
		expect(toastError).toHaveBeenCalledExactlyOnceWith(
			"Error 4: Wrong password",
		);
	});
});
