import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));

import { accountStatusState } from "$lib/api/account-status-state.svelte";
import { reportSignInFailure } from "$lib/api/sign-in";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	accountStatusState.open = false;
	accountStatusState.status = null;
});

describe("reportSignInFailure", () => {
	it("asks for phone verification instead of showing error 30", () => {
		const error = {
			kind: "Api",
			message: { code: 30, message: "Verification required" },
		};

		reportSignInFailure({ error });

		expect(accountStatusState).toMatchObject({
			open: true,
			status: { kind: "phoneVerificationRequired" },
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
