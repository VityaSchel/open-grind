import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGridMock, showErrorToastMock } = vi.hoisted(() => ({
	getGridMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("./grid", () => ({
	getGrid: getGridMock,
	getCachedProfile: () => undefined,
	patchCachedProfile: vi.fn(),
	resolveLazyProfile: vi.fn(),
	setCachedProfile: vi.fn(),
}));
vi.mock("$lib/api/users/tags", () => ({ getTags: vi.fn() }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => () => {} },
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({}),
	preferencesSnapshot: () => ({ geohash: null }),
	setPreferences: () => Promise.resolve(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/location/auto-location", () => ({
	autoLocation: {
		resolveGeohash: (geohash: string) => Promise.resolve(geohash),
	},
}));

import { gridState } from "./grid-state.svelte";

const page = (
	ids: number[],
	{ nextPage = null }: { nextPage?: number | null } = {},
) => ({ items: ids.map((id) => ({ id, type: "lazy" })), nextPage });

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

describe("a failed page", () => {
	beforeEach(async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		showErrorToastMock.mockClear();
		getGridMock.mockReset();
		getGridMock.mockResolvedValueOnce(page([1, 2, 3], { nextPage: 1 }));
		gridState.reset();
		gridState.load("9q8yyk8ytpxr");
		await settle();
		getGridMock.mockReset();
		getGridMock.mockRejectedValueOnce(new Error("offline"));
		await gridState.paging.run();
		getGridMock.mockReset();
		getGridMock.mockResolvedValue(page([4, 5, 6], { nextPage: 2 }));
	});

	it("holds the failure instead of asking for the page again", async () => {
		await gridState.paging.run();
		await gridState.paging.run();

		expect(getGridMock).not.toHaveBeenCalled();
		expect(gridState.paging.failure?.message).toBe("offline");
		expect(gridState.nextPage).toBe(1);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("asks for the same page on retry and keeps paging after it", async () => {
		gridState.paging.retry();
		await vi.waitFor(() => expect(gridState.nextPage).toBe(2));

		expect(getGridMock).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ pageNumber: 1 }),
		);
		expect(gridState.paging.failure).toBeNull();

		getGridMock.mockResolvedValue(page([7]));
		await gridState.paging.run();

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7,
		]);
		expect(gridState.nextPage).toBeNull();
	});

	it("lets a pull-to-refresh clear the failure", async () => {
		getGridMock.mockResolvedValueOnce(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ keepLoadedPages: false });
		expect(gridState.paging.failure).toBeNull();
		await gridState.paging.run();

		expect(getGridMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ pageNumber: 1 }),
		);
		expect(gridState.nextPage).toBe(2);
	});

	it("keeps the failure through a refresh that fails too", async () => {
		getGridMock.mockRejectedValueOnce(new Error("still offline"));

		await gridState.refresh({ background: true });
		await gridState.paging.run();

		expect(getGridMock).toHaveBeenCalledOnce();
		expect(gridState.paging.failure?.message).toBe("offline");
	});

	it("lets starting over clear the failure", async () => {
		getGridMock.mockResolvedValueOnce(page([1, 2, 3], { nextPage: 1 }));

		gridState.retry();
		await settle();
		await gridState.paging.run();

		expect(gridState.paging.failure).toBeNull();
		expect(getGridMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ pageNumber: 1 }),
		);
		expect(gridState.nextPage).toBe(2);
	});

	it("drops a failure that lands after the grid started over", async () => {
		getGridMock.mockResolvedValueOnce(page([1, 2, 3], { nextPage: 1 }));
		gridState.retry();
		await settle();
		const slowPage = Promise.withResolvers<never>();
		getGridMock.mockReturnValueOnce(slowPage.promise);
		const paged = gridState.paging.run();

		getGridMock.mockResolvedValueOnce(page([8, 9], { nextPage: 1 }));
		gridState.retry();
		await vi.waitFor(() =>
			expect(gridState.items.map((item) => item.id)).toEqual([8, 9]),
		);
		slowPage.reject(new Error("late"));
		await paged;

		expect(gridState.paging.failure).toBeNull();
	});
});
