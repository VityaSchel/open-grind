import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGridMock, reconcileHandlers } = vi.hoisted(() => ({
	getGridMock: vi.fn(),
	reconcileHandlers: [] as (() => unknown)[],
}));

vi.mock("./grid", () => ({
	getGrid: getGridMock,
	getCachedProfile: () => undefined,
	resolveLazyProfile: vi.fn(),
	setCachedProfile: vi.fn(),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe: (handler: () => unknown) => {
			reconcileHandlers.push(handler);
			return () => {};
		},
	},
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({}),
	setPreferences: vi.fn(),
}));

import { gridState } from "./grid-state.svelte";

const page = (ids: number[]) => ({
	items: ids.map((id) => ({ id, type: "lazy" })),
	nextPage: null,
});

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

beforeEach(async () => {
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([1]));
	gridState.reset();
	gridState.load("9q8yyk8ytpxr");
	await settle();
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([2]));
});

describe("grid reconciliation", () => {
	it("subscribes to the reconciler", () => {
		expect(reconcileHandlers).toHaveLength(1);
	});

	it("replaces the grid without emptying it first", async () => {
		const during: number[][] = [];
		getGridMock.mockImplementation(() => {
			during.push(gridState.items.map((item) => item.id));
			return Promise.resolve(page([2]));
		});

		await reconcileHandlers[0]?.();

		expect(during).toEqual([[1]]);
		expect(gridState.items.map((item) => item.id)).toEqual([2]);
		expect(gridState.loading).toBe(false);
	});

	it("does nothing until a location has been loaded", async () => {
		gridState.reset();

		await reconcileHandlers[0]?.();

		expect(getGridMock).not.toHaveBeenCalled();
	});
});
