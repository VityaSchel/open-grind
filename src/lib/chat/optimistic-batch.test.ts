import { beforeEach, describe, expect, it, vi } from "vitest";

const { showErrorToastMock } = vi.hoisted(() => ({
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { applyOptimisticBatch } from "./optimistic-batch";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyOptimisticBatch", () => {
	it("rolls back failed items and labels the toast", async () => {
		const error = new Error("offline");
		const errorLabel = vi.fn(() => "failed");
		const rollback = vi.fn();

		const rolledBack = await applyOptimisticBatch({
			items: [1, 2, 3],
			request: (item) =>
				item === 2 ? Promise.resolve() : Promise.reject(error),
			rollback,
			errorLabel,
		});

		expect(rolledBack).toBe(true);
		expect(rollback.mock.calls).toEqual([[3], [1]]);
		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "failed",
			error,
		});
	});

	it("builds no label when every item succeeds", async () => {
		const errorLabel = vi.fn(() => "failed");

		const rolledBack = await applyOptimisticBatch({
			items: [1, 2],
			request: () => Promise.resolve(),
			rollback: vi.fn(),
			errorLabel,
		});

		expect(rolledBack).toBe(false);
		expect(errorLabel).not.toHaveBeenCalled();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});
});
