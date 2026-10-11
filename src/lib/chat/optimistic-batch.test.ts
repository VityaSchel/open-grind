import { beforeEach, describe, expect, it, vi } from "vitest";

const { showErrorToastMock } = vi.hoisted(() => ({
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/i18n", async (importOriginal) => {
	const i18n = await importOriginal<typeof import("$lib/i18n")>();
	return { ...i18n, t: vi.fn(i18n.t) };
});

import { t } from "$lib/i18n";
import { applyOptimisticBatch } from "./optimistic-batch";

const errorLabel = "chat.conversations.errors.deleteFailed";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyOptimisticBatch", () => {
	it("rolls back failed items and counts them in the toast", async () => {
		const error = new Error("offline");
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
			label: "Couldn’t delete 2 conversations",
			error,
		});
	});

	it("names a single failure among successes in the singular", async () => {
		const error = new Error("offline");

		await applyOptimisticBatch({
			items: [1, 2, 3],
			request: (item) =>
				item === 3 ? Promise.reject(error) : Promise.resolve(),
			rollback: vi.fn(),
			errorLabel,
		});

		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "Couldn’t delete conversation",
			error,
		});
	});

	it("builds no label when every item succeeds", async () => {
		const rolledBack = await applyOptimisticBatch({
			items: [1, 2],
			request: () => Promise.resolve(),
			rollback: vi.fn(),
			errorLabel,
		});

		expect(rolledBack).toBe(false);
		expect(t).not.toHaveBeenCalled();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});
});
