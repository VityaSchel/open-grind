import { flushSync } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGridMock, resolveGeohashMock } = vi.hoisted(() => ({
	getGridMock: vi.fn(),
	resolveGeohashMock: vi.fn(),
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
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/location/auto-location", () => ({
	autoLocation: { resolveGeohash: resolveGeohashMock },
}));

import { gridState } from "./grid-state.svelte";

const LOADED = "9q8yyk8ytpxr";
const ELSEWHERE = "ezs42e44yx96";
const RETARGETED = "u33dc0cpn3hy";

const page = (
	ids: number[],
	{ nextPage = null }: { nextPage?: number | null } = {},
) => ({ items: ids.map((id) => ({ id, type: "lazy" })), nextPage });

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

describe("starting over", () => {
	const startedOver = vi.fn();
	let stopListening = () => {};

	beforeEach(async () => {
		resolveGeohashMock.mockReset();
		resolveGeohashMock.mockImplementation((geohash: string) =>
			Promise.resolve(geohash),
		);
		getGridMock.mockReset();
		getGridMock.mockResolvedValue(page([1]));
		gridState.reset();
		gridState.load(LOADED);
		await settle();
		getGridMock.mockReset();
		getGridMock.mockResolvedValue(page([2]));
		startedOver.mockReset();
		stopListening = gridState.onStartOver(startedOver);
		return () => stopListening();
	});

	it("tells listeners when a picked location replaces the grid", async () => {
		gridState.load(ELSEWHERE);

		expect(startedOver).toHaveBeenCalledOnce();
		await settle();
	});

	it("stays quiet when the loaded location loads again", () => {
		gridState.load(LOADED);

		expect(startedOver).not.toHaveBeenCalled();
	});

	it("stays quiet when a refresh retargets the location", async () => {
		resolveGeohashMock.mockResolvedValue(RETARGETED);
		await gridState.refresh();

		gridState.load(RETARGETED);

		expect(gridState.items.map((item) => item.id)).toEqual([2]);
		expect(startedOver).not.toHaveBeenCalled();
	});

	it("starts over once when a live fix retargets a picked location", async () => {
		resolveGeohashMock.mockResolvedValue(RETARGETED);
		const pendingPage = Promise.withResolvers<ReturnType<typeof page>>();
		getGridMock.mockReturnValue(pendingPage.promise);
		gridState.load(ELSEWHERE);
		await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());

		gridState.load(RETARGETED);

		expect(startedOver).toHaveBeenCalledOnce();
		expect(getGridMock).toHaveBeenCalledOnce();
		expect(getGridMock.mock.calls[0]?.[0]).toMatchObject({
			nearbyGeoHash: RETARGETED,
		});
		pendingPage.resolve(page([3]));
		await vi.waitFor(() =>
			expect(gridState.items.map((item) => item.id)).toEqual([3]),
		);
	});

	it("tells listeners when the grid is retried", async () => {
		gridState.retry();

		expect(startedOver).toHaveBeenCalledOnce();
		await settle();
	});

	it("stays quiet through refreshes and the next page", async () => {
		getGridMock.mockResolvedValue(page([2], { nextPage: 1 }));

		await gridState.refresh({ keepLoadedPages: false });
		await gridState.refresh({ background: true });
		await gridState.paging.run();

		expect(getGridMock).toHaveBeenCalledTimes(3);
		expect(startedOver).not.toHaveBeenCalled();
	});

	it("stops telling a listener that unsubscribed", async () => {
		stopListening();

		gridState.load(ELSEWHERE);

		expect(startedOver).not.toHaveBeenCalled();
		await settle();
	});

	it("keeps what a listener reads out of the effect that loads the grid", async () => {
		const watched = $state({ value: 0 });
		const stopReading = gridState.onStartOver(() => void watched.value);
		let effectRuns = 0;
		const destroy = $effect.root(() => {
			$effect.pre(() => {
				effectRuns += 1;
				gridState.load(ELSEWHERE);
			});
		});
		flushSync();

		watched.value += 1;
		flushSync();

		expect(effectRuns).toBe(1);
		destroy();
		stopReading();
		await settle();
	});
});
