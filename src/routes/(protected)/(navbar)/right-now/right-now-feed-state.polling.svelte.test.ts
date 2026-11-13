import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	appLifecycle,
	getRightNowFeedMock,
	preferences,
	reconcileHandlers,
	showErrorToastMock,
} = vi.hoisted(() => ({
	appLifecycle: { active: true },
	getRightNowFeedMock: vi.fn(),
	preferences: { stayOnline: true },
	reconcileHandlers: [] as ((cause?: string) => void | Promise<void>)[],
	showErrorToastMock: vi.fn(),
}));

vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/right-now/feed.ts", () => ({
	getRightNowFeed: getRightNowFeedMock,
	rightNowFeedVersion: () => Promise.resolve("v4"),
}));
vi.mock("#lib/api/browse/blocks.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/browse/blocks.ts")>()),
	markBlockedProfilesUnviewable: () => Promise.resolve(),
}));
vi.mock("#lib/api/browse/hides.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/browse/hides.ts")>()),
	markHiddenProfilesUnviewable: () => Promise.resolve(),
}));
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({ appLifecycle }));
vi.mock("#lib/app-data/preferences.svelte.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("#lib/app-data/preferences.svelte.ts")
	>()),
	getPreferences: () => Promise.resolve({ geohash: null }),
	preferencesLoaded: () => true,
	preferencesSnapshot: () => preferences,
	setPreferences: () => Promise.resolve(),
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: (request: () => Promise<unknown>) => request(),
}));
vi.mock("#lib/push/opening-deeplink.ts", () => ({
	pushDeeplinkAhead: () => Promise.resolve(false),
}));
vi.mock("#lib/util/reconcile.ts", () => ({
	reconciler: {
		subscribe(handler: (cause?: string) => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return () => {};
		},
	},
}));
import { clearAccountCaches } from "#lib/api/account-caches.ts";
import type { RightNowFeedResponse } from "#lib/model/right-now/feed.ts";
import { getRightNowFeedState } from "./right-now-feed-state.svelte";
import {
	createState,
	destroyCreatedStates,
	feed,
	MINUTE,
	post,
	SECOND,
	shown,
} from "./right-now-feed-test-helpers";

beforeEach(() => {
	clearAccountCaches();
	appLifecycle.active = true;
	preferences.stayOnline = true;
	getRightNowFeedMock.mockReset();
	getRightNowFeedMock.mockResolvedValue(feed([post(1)]));
	showErrorToastMock.mockReset();
	reconcileHandlers.length = 0;
});

afterEach(() => {
	destroyCreatedStates();
	vi.restoreAllMocks();
});

describe("RightNowFeedState polling", () => {
	const settle = () => vi.advanceTimersByTimeAsync(0);

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("refetches once two minutes have passed since the last fetch", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2)]));
		const state = createState();
		await settle();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(2 * MINUTE - 1);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(shown(state)).toEqual([2]);
		detach();
	});

	it("counts the two minutes from the latest fetch, whatever started it", async () => {
		const state = createState();
		await settle();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(MINUTE);
		await reconcileHandlers[0]?.();
		await vi.advanceTimersByTimeAsync(2 * MINUTE - 1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		detach();
	});

	it("refetches on the tick closest to two minutes after the last fetch, even a few seconds early", async () => {
		const state = createState();
		await settle();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(65 * SECOND);
		await reconcileHandlers[0]?.();
		await vi.advanceTimersByTimeAsync(115 * SECOND - 1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		detach();
	});

	it("waits two minutes from the start of a failed poll before polling again", async () => {
		const state = createState();
		await settle();
		const failedPoll = Promise.withResolvers<RightNowFeedResponse>();
		getRightNowFeedMock.mockReturnValueOnce(failedPoll.promise);
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(30 * SECOND);
		failedPoll.reject(new Error("offline"));
		await vi.advanceTimersByTimeAsync(15 * SECOND);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(2 * MINUTE - 45 * SECOND - 1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		detach();
	});

	it("stops polling once the feed screen is left", async () => {
		const state = createState();
		await settle();
		state.attachView()();

		await vi.advanceTimersByTimeAsync(10 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("stops polling once destroyed while the feed screen is still attached", async () => {
		const state = createState();
		await settle();
		const idle = vi.getTimerCount();
		state.attachView();

		expect(vi.getTimerCount()).toBe(idle + 1);

		state.destroy();

		expect(vi.getTimerCount()).toBe(idle);
	});

	it("keeps a single poll when the feed screen attaches again without detaching", async () => {
		const state = createState();
		await settle();
		state.attachView();
		await vi.advanceTimersByTimeAsync(5 * SECOND);
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(2 * MINUTE - 5 * SECOND);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(5 * SECOND);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("keeps polling when an earlier feed screen detaches after a newer one attached", async () => {
		const state = createState();
		await settle();
		const detachEarlier = state.attachView();
		const detach = state.attachView();
		detachEarlier();

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("keeps polling when the newer of two feed screens detaches first", async () => {
		const state = createState();
		await settle();
		const detachEarlier = state.attachView();
		const detachNewer = state.attachView();
		detachNewer();

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		detachEarlier();
	});

	it("stops polling once the last feed screen detaches", async () => {
		const state = createState();
		await settle();
		const detachEarlier = state.attachView();
		const detachNewer = state.attachView();
		detachNewer();
		detachEarlier();

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
	});

	it("refetches on returning to the app while Stay online is off and one of two feed screens is still attached", async () => {
		preferences.stayOnline = false;
		const state = createState();
		const detachEarlier = state.attachView();
		const detach = state.attachView();
		await settle();
		detachEarlier();

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		await reconcileHandlers[0]?.("resume");

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("skips polls while the window is hidden and polls once it shows again", async () => {
		const hidden = vi
			.spyOn(document, "hidden", "get")
			.mockReturnValue(true);
		const state = createState();
		await settle();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		hidden.mockReturnValue(false);
		await vi.advanceTimersByTimeAsync(15 * SECOND);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("skips polls while the app is inactive and polls once it is active again", async () => {
		appLifecycle.active = false;
		const state = createState();
		await settle();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		appLifecycle.active = true;
		await vi.advanceTimersByTimeAsync(15 * SECOND);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("defers polls while Stay online is off until the feed screen shows again", async () => {
		preferences.stayOnline = false;
		const state = createState();
		const detach = state.attachView();
		await settle();

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);
		detach();

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		state.attachView()();
		await settle();

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
	});

	it("keeps the feed without a toast when a poll fails", async () => {
		const state = createState();
		await settle();
		getRightNowFeedMock.mockRejectedValueOnce(new Error("offline"));
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(shown(state)).toEqual([1]);
		expect(state.error).toBeNull();
		expect(showErrorToastMock).not.toHaveBeenCalled();
		detach();
	});

	it("stops polling once the account caches clear", async () => {
		const state = getRightNowFeedState(99);
		await settle();
		const idle = vi.getTimerCount();
		const detach = state.attachView();

		expect(vi.getTimerCount()).toBe(idle + 1);

		clearAccountCaches();

		expect(vi.getTimerCount()).toBe(idle);

		await vi.advanceTimersByTimeAsync(10 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();
		detach();
	});
});
