import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	atHomeLocationMock,
	getPreferencesMock,
	getRightNowFeedMock,
	rightNowFeedVersionMock,
	storeLocationMock,
} = vi.hoisted(() => ({
	atHomeLocationMock:
		vi.fn<(request: () => Promise<unknown>) => Promise<unknown>>(),
	getPreferencesMock: vi.fn(),
	getRightNowFeedMock: vi.fn(),
	rightNowFeedVersionMock: vi.fn(),
	storeLocationMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));
vi.mock("#lib/api/right-now/feed.ts", () => ({
	getRightNowFeed: getRightNowFeedMock,
	rightNowFeedVersion: rightNowFeedVersionMock,
}));
vi.mock("#lib/api/browse/blocks.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/browse/blocks.ts")>()),
	markBlockedProfilesUnviewable: () => Promise.resolve(),
}));
vi.mock("#lib/api/browse/hides.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/browse/hides.ts")>()),
	markHiddenProfilesUnviewable: () => Promise.resolve(),
}));
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({
	appLifecycle: { active: true },
}));
vi.mock("#lib/app-data/preferences.svelte.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("#lib/app-data/preferences.svelte.ts")
	>()),
	getPreferences: getPreferencesMock,
	preferencesLoaded: () => true,
	preferencesSnapshot: () => ({ stayOnline: true }),
	setPreferences: () => Promise.resolve(),
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: atHomeLocationMock,
}));
vi.mock("#lib/grid/grid.ts", () => ({ storeLocation: storeLocationMock }));
vi.mock("#lib/push/opening-deeplink.ts", () => ({
	pushDeeplinkAhead: () => Promise.resolve(false),
}));
vi.mock("#lib/util/reconcile.ts", () => ({
	reconciler: { subscribe: () => () => {} },
}));
import { clearAccountCaches } from "#lib/api/account-caches.ts";
import { getRightNowFeedState } from "./right-now-feed-state.svelte";
import {
	createState,
	destroyCreatedStates,
	feed,
	post,
	shown,
	waitForLoaded,
} from "./right-now-feed-test-helpers";

const BERLIN = "u33dc0cpgp00";
const MUNICH = "u281z7j5c0e0";

beforeEach(() => {
	clearAccountCaches();
	atHomeLocationMock.mockReset();
	atHomeLocationMock.mockImplementation((request) => request());
	getPreferencesMock.mockReset();
	getPreferencesMock.mockResolvedValue({ geohash: BERLIN });
	getRightNowFeedMock.mockReset();
	getRightNowFeedMock.mockResolvedValue(feed([post(1)]));
	rightNowFeedVersionMock.mockReset();
	rightNowFeedVersionMock.mockResolvedValue("v4");
	storeLocationMock.mockClear();
});

afterEach(() => {
	destroyCreatedStates();
	vi.restoreAllMocks();
});

describe("RightNowFeedState location", () => {
	it("stores the saved location on the server right before each feed request", async () => {
		const state = createState();
		await waitForLoaded(state);
		await state.refresh();

		expect(storeLocationMock.mock.calls).toEqual([
			[{ geohash: BERLIN }],
			[{ geohash: BERLIN }],
		]);
		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		const [firstStore, secondStore] =
			storeLocationMock.mock.invocationCallOrder;
		const [firstFeed, secondFeed] =
			getRightNowFeedMock.mock.invocationCallOrder;
		expect(firstStore).toBeLessThan(firstFeed ?? 0);
		expect(firstFeed).toBeLessThan(secondStore ?? 0);
		expect(secondStore).toBeLessThan(secondFeed ?? 0);
	});

	it("requests the feed without storing a location when none is saved", async () => {
		getPreferencesMock.mockResolvedValue({ geohash: null });

		const state = createState();
		await waitForLoaded(state);

		expect(storeLocationMock).not.toHaveBeenCalled();
		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("starts over from the top at the new location when the location changes", async () => {
		const state = createState();
		await waitForLoaded(state);
		const startedOver = vi.fn();
		state.onStartOver(startedOver);
		state.scrollY = 600;
		getPreferencesMock.mockResolvedValue({ geohash: MUNICH });
		getRightNowFeedMock.mockResolvedValueOnce(feed([post(2)]));

		state.followLocation(MUNICH);
		await waitForLoaded(state);

		expect(startedOver).toHaveBeenCalledOnce();
		expect(state.scrollY).toBe(0);
		expect(storeLocationMock).toHaveBeenLastCalledWith({ geohash: MUNICH });
		expect(shown(state)).toEqual([2]);
	});

	it("keeps the feed when the followed location is the one it was fetched for", async () => {
		const state = createState();
		await waitForLoaded(state);

		state.followLocation(BERLIN);

		expect(state.loading).toBe(false);
		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("lets the first load pick up a location followed before it read one", async () => {
		const state = createState();
		state.followLocation(BERLIN);
		await waitForLoaded(state);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
		expect(storeLocationMock).toHaveBeenCalledExactlyOnceWith({
			geohash: BERLIN,
		});
	});

	it("stores the location saved while the first request waited for its feed version", async () => {
		const version = Promise.withResolvers<string>();
		rightNowFeedVersionMock.mockReturnValueOnce(version.promise);
		const state = createState();
		await vi.waitFor(() =>
			expect(rightNowFeedVersionMock).toHaveBeenCalledOnce(),
		);

		getPreferencesMock.mockResolvedValue({ geohash: MUNICH });
		state.followLocation(MUNICH);
		version.resolve("v4");
		await waitForLoaded(state);

		expect(storeLocationMock).toHaveBeenCalledExactlyOnceWith({
			geohash: MUNICH,
		});
		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("stores the location and requests the feed only once the home location is back", async () => {
		const home = Promise.withResolvers<void>();
		atHomeLocationMock.mockImplementationOnce(async (request) => {
			await home.promise;
			return request();
		});

		const state = createState();
		await vi.waitFor(() =>
			expect(atHomeLocationMock).toHaveBeenCalledOnce(),
		);

		expect(storeLocationMock).not.toHaveBeenCalled();
		expect(getRightNowFeedMock).not.toHaveBeenCalled();

		home.resolve();
		await waitForLoaded(state);

		expect(storeLocationMock).toHaveBeenCalledExactlyOnceWith({
			geohash: BERLIN,
		});
		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("never stores a location for an account signed out while waiting for the home location", async () => {
		const home = Promise.withResolvers<void>();
		atHomeLocationMock.mockImplementationOnce(async (request) => {
			await home.promise;
			return request();
		});

		const state = getRightNowFeedState(99);
		await vi.waitFor(() =>
			expect(atHomeLocationMock).toHaveBeenCalledOnce(),
		);

		clearAccountCaches();
		home.resolve();
		await waitForLoaded(state);

		expect(storeLocationMock).not.toHaveBeenCalled();
		expect(getRightNowFeedMock).not.toHaveBeenCalled();
	});
});
