import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastMock } = vi.hoisted(() => ({ toastMock: { error: vi.fn() } }));

vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/api/error-copy", () => ({ promptCopyError: vi.fn() }));

import { showErrorToast } from "./error-toast";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("showErrorToast", () => {
	it("shows the toast under the caller's id so a repeat replaces it", () => {
		showErrorToast({ label: "Failed", error: new Error("x"), id: "same" });

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Failed",
			expect.objectContaining({ id: "same" }),
		);
	});

	it("keeps the caller's id on a toast that offers a retry", () => {
		showErrorToast({
			label: "Failed",
			error: new Error("x"),
			onRetry: vi.fn(),
			id: "same",
		});

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Failed",
			expect.objectContaining({ id: "same" }),
		);
	});
});
