import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));

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
