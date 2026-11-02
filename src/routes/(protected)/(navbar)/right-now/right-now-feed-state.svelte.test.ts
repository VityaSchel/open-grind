import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	atHomeLocationMock,
	getPreferencesMock,
	getRightNowFeedMock,
	markBlockedProfilesUnviewableMock,
	markHiddenProfilesUnviewableMock,
	preferences,
	reconcileHandlers,
	rightNowFeedVersionMock,
	setPreferencesMock,
	showErrorToastMock,
	unsubscribeReconcileMock,
} = vi.hoisted(() => ({
	atHomeLocationMock:
		vi.fn<(request: () => Promise<unknown>) => Promise<unknown>>(),
	getPreferencesMock: vi.fn(),
	getRightNowFeedMock: vi.fn(),
	markBlockedProfilesUnviewableMock: vi.fn(() => Promise.resolve()),
	markHiddenProfilesUnviewableMock: vi.fn(() => Promise.resolve()),
	preferences: { stayOnline: true },
	reconcileHandlers: [] as ((cause?: string) => void | Promise<void>)[],
	rightNowFeedVersionMock: vi.fn(),
	setPreferencesMock: vi.fn(() => Promise.resolve()),
	showErrorToastMock: vi.fn(),
	unsubscribeReconcileMock: vi.fn(),
}));

vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/right-now/feed.ts", () => ({
	getRightNowFeed: getRightNowFeedMock,
	rightNowFeedVersion: rightNowFeedVersionMock,
}));
vi.mock("#lib/api/browse/blocks.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/browse/blocks.ts")>()),
	markBlockedProfilesUnviewable: markBlockedProfilesUnviewableMock,
}));
vi.mock("#lib/api/browse/hides.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/browse/hides.ts")>()),
	markHiddenProfilesUnviewable: markHiddenProfilesUnviewableMock,
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
	preferencesSnapshot: () => preferences,
	setPreferences: setPreferencesMock,
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: atHomeLocationMock,
}));
vi.mock("#lib/push/opening-deeplink.ts", () => ({
	pushDeeplinkAhead: () => Promise.resolve(false),
}));
vi.mock("#lib/util/reconcile.ts", () => ({
	reconciler: {
		subscribe(handler: (cause?: string) => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return unsubscribeReconcileMock;
		},
	},
}));
import { clearAccountCaches } from "#lib/api/account-caches.ts";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "#lib/api/users/profile-viewability.ts";
import { mergeProfileEditIntoCaches } from "#lib/api/users/profiles.ts";
import { defaultRightNowFeedFilters } from "#lib/model/right-now/filters.ts";
import type { RightNowFeedResponse } from "#lib/model/right-now/feed.ts";
import {
	getRightNowFeedState,
	type RightNowFeedState,
} from "./right-now-feed-state.svelte";
import {
	createState,
	curatedPost,
	deferred,
	destroyCreatedStates,
	discreetPost,
	feed,
	lockedPost,
	post,
	shown,
	upsellInsert,
} from "./right-now-feed-test-helpers";

function favorites(state: RightNowFeedState) {
	return state.entries.map(({ item }) =>
		"favorite" in item.data ? item.data.favorite : null,
	);
}

async function waitForLoaded(state: RightNowFeedState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}

beforeEach(() => {
	clearAccountCaches();
	preferences.stayOnline = true;
	atHomeLocationMock.mockReset();
	atHomeLocationMock.mockImplementation((request) => request());
	getPreferencesMock.mockReset();
	getPreferencesMock.mockResolvedValue({});
	getRightNowFeedMock.mockReset();
	getRightNowFeedMock.mockResolvedValue(feed([post(1)]));
	markBlockedProfilesUnviewableMock.mockClear();
	markHiddenProfilesUnviewableMock.mockClear();
	rightNowFeedVersionMock.mockReset();
	rightNowFeedVersionMock.mockResolvedValue("v4");
	setPreferencesMock.mockClear();
	showErrorToastMock.mockReset();
	unsubscribeReconcileMock.mockReset();
	reconcileHandlers.length = 0;
});

afterEach(() => {
	destroyCreatedStates();
	vi.restoreAllMocks();
});

describe("RightNowFeedState while Stay online is off", () => {
	beforeEach(() => {
		preferences.stayOnline = false;
	});

	it("waits for the feed screen before its first fetch", async () => {
		const state = createState();
		await new Promise((resolve) => setTimeout(resolve));

		expect(getRightNowFeedMock).not.toHaveBeenCalled();
		expect(state.loading).toBe(true);

		const detach = state.attachView();
		await vi.waitFor(() => expect(shown(state)).toEqual([1]));
		detach();

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("waits for the feed screen before refetching for an unblock", async () => {
		const state = createState();
		state.attachView()();
		await waitForLoaded(state);
		getRightNowFeedMock.mockClear();

		markProfileViewable(1);
		await new Promise((resolve) => setTimeout(resolve));

		expect(getRightNowFeedMock).not.toHaveBeenCalled();

		state.attachView()();
		await vi.waitFor(() => expect(state.refreshing).toBe(false));

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});
});

describe("RightNowFeedState", () => {
	it("loads the feed on creation while Stay online is on", async () => {
		const state = createState();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(shown(state)).toEqual([1]);
		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("requests the account's feed version with the saved filters", async () => {
		rightNowFeedVersionMock.mockResolvedValue("v6");
		getPreferencesMock.mockResolvedValue({
			rightNowFeedFilters: {
				...defaultRightNowFeedFilters,
				sort: "DISTANCE",
				hostingEnabled: true,
				hosting: false,
				ageEnabled: true,
				age: [25, 40],
			},
		});

		const state = createState();
		await waitForLoaded(state);

		expect(getRightNowFeedMock).toHaveBeenCalledExactlyOnceWith({
			version: "v6",
			query: { sort: "DISTANCE", hosting: false, ageMin: 25, ageMax: 40 },
		});
	});

	it("requests the feed only once the location is back home", async () => {
		const home = deferred<void>();
		atHomeLocationMock.mockImplementationOnce(async (request) => {
			await home.promise;
			return request();
		});

		const state = createState();
		await vi.waitFor(() =>
			expect(atHomeLocationMock).toHaveBeenCalledOnce(),
		);

		expect(getRightNowFeedMock).not.toHaveBeenCalled();

		home.resolve();
		await waitForLoaded(state);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("never requests the feed for an account signed out while waiting for the home location", async () => {
		const home = deferred<void>();
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

		expect(getRightNowFeedMock).not.toHaveBeenCalled();
	});

	it("refetches with the new query when a filter changes", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2)]));
		const state = createState();
		await waitForLoaded(state);

		state.filters.set({ sort: "DISTANCE" });
		await waitForLoaded(state);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(getRightNowFeedMock).toHaveBeenLastCalledWith({
			version: "v4",
			query: { sort: "DISTANCE" },
		});
		expect(shown(state)).toEqual([2]);
	});

	it("shows twenty posts at a time and reveals more on demand", async () => {
		getRightNowFeedMock.mockResolvedValue(
			feed(Array.from({ length: 25 }, (_, index) => post(index + 1))),
		);
		const state = createState();
		await waitForLoaded(state);

		expect(state.entries).toHaveLength(20);
		expect(state.hasMore).toBe(true);

		state.loadMore();

		expect(state.entries).toHaveLength(25);
		expect(state.hasMore).toBe(false);
	});

	it("starts over from the top with no posts when a filter changes and the refetch fails", async () => {
		getRightNowFeedMock.mockResolvedValueOnce(
			feed(Array.from({ length: 25 }, (_, index) => post(index + 1))),
		);
		const state = createState();
		await waitForLoaded(state);
		state.loadMore();
		state.scrollY = 1_200;

		expect(state.entries).toHaveLength(25);

		getRightNowFeedMock.mockRejectedValueOnce(new Error("offline"));
		state.filters.set({ sort: "DISTANCE" });
		await waitForLoaded(state);

		expect(state.entries).toEqual([]);
		expect(state.visibleCount).toBe(20);
		expect(state.scrollY).toBe(0);
		expect(state.error?.message).toBe("offline");
	});

	it("records initial load errors and retries", async () => {
		getRightNowFeedMock.mockRejectedValueOnce(new Error("offline"));

		const state = createState();
		await waitForLoaded(state);

		expect(state.error?.message).toBe("offline");

		state.retry();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(shown(state)).toEqual([1]);
	});

	it("leaves out tips, upsells and posts by blocked and hidden authors, and keeps discreet posts", async () => {
		markBlockedProfilesUnviewableMock.mockImplementationOnce(() => {
			markProfileUnviewable(1);
			return Promise.resolve();
		});
		markHiddenProfilesUnviewableMock.mockImplementationOnce(() => {
			markProfileUnviewable(2);
			return Promise.resolve();
		});
		getRightNowFeedMock.mockResolvedValue(
			feed([
				post(1),
				lockedPost(2),
				post(3),
				discreetPost(500),
				curatedPost(),
				upsellInsert(),
			]),
		);

		const state = createState();
		await waitForLoaded(state);

		expect(shown(state)).toEqual([3, "discreet_right_now_post_v1"]);
	});

	it("catches up on blocks and hides on every load", async () => {
		const state = createState();
		await waitForLoaded(state);

		expect(markBlockedProfilesUnviewableMock).toHaveBeenCalledOnce();
		expect(markHiddenProfilesUnviewableMock).toHaveBeenCalledOnce();

		await reconcileHandlers[0]?.();

		expect(markBlockedProfilesUnviewableMock).toHaveBeenCalledTimes(2);
		expect(markHiddenProfilesUnviewableMock).toHaveBeenCalledTimes(2);
	});

	it("loads the feed and logs the failure when catching up on blocks or hides fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const blocksFailure = new Error("blocks offline");
		const hidesFailure = new Error("hides offline");
		markBlockedProfilesUnviewableMock.mockRejectedValueOnce(blocksFailure);
		markHiddenProfilesUnviewableMock.mockRejectedValueOnce(hidesFailure);

		const state = createState();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(shown(state)).toEqual([1]);
		expect(consoleError).toHaveBeenCalledWith(blocksFailure);
		expect(consoleError).toHaveBeenCalledWith(hidesFailure);
	});

	it("drops an author's posts once they become unviewable, and keeps them dropped", async () => {
		getRightNowFeedMock.mockResolvedValue(
			feed([post(1), post(1, { id: 11 }), discreetPost(5), post(2)]),
		);
		const state = createState();
		await waitForLoaded(state);

		markProfileUnviewable(1);

		expect(shown(state)).toEqual(["discreet_right_now_post_v1", 2]);

		await reconcileHandlers[0]?.();

		expect(shown(state)).toEqual(["discreet_right_now_post_v1", 2]);
	});

	it("drops posts by an author marked unviewable while a refresh is in flight", async () => {
		const state = createState();
		await waitForLoaded(state);

		const gate = deferred<RightNowFeedResponse>();
		getRightNowFeedMock.mockReturnValueOnce(gate.promise);

		const reconciled = reconcileHandlers[0]?.();
		markProfileUnviewable(1);
		gate.resolve(feed([post(1), post(2)]));
		await reconciled;

		expect(shown(state)).toEqual([2]);
	});

	it("brings an author's posts back when they become viewable again", async () => {
		const state = createState();
		await waitForLoaded(state);
		markProfileUnviewable(1);

		expect(shown(state)).toEqual([]);

		markProfileViewable(1);
		await vi.waitFor(() => expect(shown(state)).toEqual([1]));

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
	});

	it("stars an author's posts when they are favorited elsewhere", async () => {
		getRightNowFeedMock.mockResolvedValue(
			feed([post(1), post(1, { id: 11 }), post(2), discreetPost(5)]),
		);
		const state = createState();
		await waitForLoaded(state);

		mergeProfileEditIntoCaches({
			cacheProfileId: 1,
			patch: { isFavorite: true },
		});

		expect(favorites(state)).toEqual([true, true, false, null]);
	});

	it("stops following favorites once destroyed", async () => {
		const state = createState();
		await waitForLoaded(state);
		state.destroy();

		mergeProfileEditIntoCaches({
			cacheProfileId: 1,
			patch: { isFavorite: true },
		});

		expect(favorites(state)).toEqual([false]);
	});

	it("keeps the feed without a toast when a background refresh fails", async () => {
		const state = createState();
		await waitForLoaded(state);
		getRightNowFeedMock.mockRejectedValueOnce(new Error("offline"));

		await reconcileHandlers[0]?.();

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(shown(state)).toEqual([1]);
		expect(state.error).toBeNull();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("shows a retryable toast when a pull-to-refresh fails", async () => {
		const state = createState();
		await waitForLoaded(state);
		getRightNowFeedMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(feed([post(2)]));

		await state.refresh();

		expect(shown(state)).toEqual([1]);
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to refresh Right Now",
			error: expect.any(Error),
			onRetry: expect.any(Function),
		});

		const { onRetry } = showErrorToastMock.mock.calls[0]![0] as {
			onRetry: () => void;
		};
		onRetry();

		await vi.waitFor(() => expect(shown(state)).toEqual([2]));
	});
});

describe("getRightNowFeedState", () => {
	it("keeps one loaded state per account until the account caches clear", async () => {
		const state = getRightNowFeedState(99);
		await waitForLoaded(state);
		state.visibleCount = 40;

		const revisited = getRightNowFeedState(99);
		revisited.load();

		expect(revisited).toBe(state);
		expect(revisited.visibleCount).toBe(40);
		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		clearAccountCaches();
		const fresh = getRightNowFeedState(99);

		expect(fresh).not.toBe(state);
		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();

		await waitForLoaded(fresh);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
	});
});
