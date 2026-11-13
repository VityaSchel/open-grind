import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	appLifecycle,
	getRightNowFeedMock,
	preferences,
	stored,
	reconcileHandlers,
	showErrorToastMock,
} = vi.hoisted(() => ({
	appLifecycle: { active: true },
	getRightNowFeedMock: vi.fn(),
	preferences: { stayOnline: true },
	stored: { geohash: null as string | null },
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
	getPreferences: () => Promise.resolve({ geohash: stored.geohash }),
	preferencesLoaded: () => true,
	preferencesSnapshot: () => preferences,
	setPreferences: () => Promise.resolve(),
}));
vi.mock("#lib/grid/grid.ts", () => ({
	storeLocation: () => Promise.resolve(),
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
import { markProfileUnviewable } from "#lib/api/users/profile-viewability.ts";
import type { RightNowFeedResponse } from "#lib/model/right-now/feed.ts";
import {
	createState,
	curatedPost,
	destroyCreatedStates,
	feed,
	post,
	shown,
	upsellInsert,
} from "./right-now-feed-test-helpers";
import { MINUTE, SECOND } from "./right-now-post-test-helpers";

beforeEach(() => {
	clearAccountCaches();
	appLifecycle.active = true;
	preferences.stayOnline = true;
	stored.geohash = null;
	getRightNowFeedMock.mockReset();
	getRightNowFeedMock.mockResolvedValue(feed([post(1)]));
	showErrorToastMock.mockReset();
	reconcileHandlers.length = 0;
});

afterEach(() => {
	destroyCreatedStates();
	vi.restoreAllMocks();
});

describe("RightNowFeedState new posts", () => {
	const SCROLLED = 400;
	const settle = () => vi.advanceTimersByTimeAsync(0);

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each([0, 16])(
		"shows new posts on the poll while the list rests %i px from the top, where the scroll-to-top button stays hidden",
		async (scrollY) => {
			getRightNowFeedMock
				.mockResolvedValueOnce(feed([post(1)]))
				.mockResolvedValueOnce(feed([post(2), post(1)]));
			const state = createState();
			await settle();
			const detach = state.attachView();
			state.followScroll(scrollY);

			await vi.advanceTimersByTimeAsync(2 * MINUTE);

			expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
			expect(shown(state)).toEqual([2, 1]);
			expect(state.hasNewPosts).toBe(false);
			detach();
		},
	);

	it("holds new posts back from 17 px down, where the scroll-to-top button shows", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(17);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(shown(state)).toEqual([1]);
		expect(state.hasNewPosts).toBe(true);
		detach();
	});

	it("keeps holding new posts back through later polls on returning to a feed that was left scrolled down", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]));
		const state = createState();
		await settle();
		const leave = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		leave();

		const detach = state.attachView();
		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(shown(state)).toEqual([1]);
		expect(state.hasNewPosts).toBe(true);
		detach();
	});

	it("only checks for new posts once two minutes have passed with the list scrolled down, keeping the shown list", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);

		await vi.advanceTimersByTimeAsync(2 * MINUTE - 1);

		expect(getRightNowFeedMock).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(1);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(shown(state)).toEqual([1]);
		expect(state.hasNewPosts).toBe(true);
		detach();
	});

	it("finds nothing new when the check returns only shown posts, inserts and posts by blocked or hidden authors", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1), post(2)]))
			.mockResolvedValueOnce(
				feed([curatedPost(), post(5), post(2), upsellInsert()]),
			);
		const state = createState();
		await settle();
		markProfileUnviewable(5);
		const detach = state.attachView();
		state.followScroll(SCROLLED);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(state.hasNewPosts).toBe(false);
		expect(shown(state)).toEqual([1, 2]);
		detach();
	});

	it("stops checking once new posts are found, and a refresh shows them and resumes checking", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		await vi.advanceTimersByTimeAsync(6 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);

		await state.refresh();

		expect(shown(state)).toEqual([2, 1]);
		expect(state.hasNewPosts).toBe(false);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(4);
		detach();
	});

	it("shows held-back posts once the list is back at the top", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]))
			.mockResolvedValueOnce(feed([post(3), post(2), post(1)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		expect(state.hasNewPosts).toBe(true);

		state.followScroll(0);
		await settle();

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		expect(shown(state)).toEqual([3, 2, 1]);
		expect(state.hasNewPosts).toBe(false);
		detach();
	});

	it("shows the new posts of a check that returns after the list reached the top", async () => {
		const check = Promise.withResolvers<RightNowFeedResponse>();
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockReturnValueOnce(check.promise)
			.mockResolvedValueOnce(feed([post(2), post(1)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		state.followScroll(0);
		check.resolve(feed([post(2), post(1)]));
		await settle();

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		expect(shown(state)).toEqual([2, 1]);
		expect(state.hasNewPosts).toBe(false);
		detach();
	});

	it("leaves held-back posts to a refresh that is already under way when the list reaches the top", async () => {
		const tapped = Promise.withResolvers<RightNowFeedResponse>();
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]))
			.mockReturnValueOnce(tapped.promise);
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		const refreshed = state.refresh();
		state.followScroll(0);
		tapped.resolve(feed([post(2), post(1)]));
		await refreshed;
		await settle();

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		expect(shown(state)).toEqual([2, 1]);
		detach();
	});

	it("does not fetch for held-back posts at the top once Stay online is switched off", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2), post(1)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		preferences.stayOnline = false;

		state.followScroll(0);
		await settle();

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(shown(state)).toEqual([1]);
		detach();
	});

	it("fills an empty feed on the next poll instead of flagging new posts", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([]))
			.mockResolvedValueOnce(feed([post(2)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(shown(state)).toEqual([2]);
		expect(state.hasNewPosts).toBe(false);
		detach();
	});

	it("fills a feed whose posts all expired on the next poll instead of flagging new posts", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(
				feed([post(1, { expiration: Date.now() + MINUTE })]),
			)
			.mockResolvedValueOnce(feed([post(2)]));
		const state = createState();
		let listed: ReturnType<typeof shown> = [];
		const stop = $effect.root(() => {
			$effect(() => {
				listed = shown(state);
			});
		});
		await settle();
		flushSync();
		const detach = state.attachView();
		state.followScroll(SCROLLED);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		flushSync();

		expect(listed).toEqual([2]);
		expect(state.hasNewPosts).toBe(false);
		detach();
		stop();
	});

	it("refills a feed whose posts expired while new posts were held back", async () => {
		getRightNowFeedMock
			.mockResolvedValueOnce(
				feed([
					post(1, {
						expiration: Date.now() + 2 * MINUTE + 15 * SECOND,
					}),
				]),
			)
			.mockResolvedValueOnce(feed([post(2), post(1)]))
			.mockResolvedValueOnce(feed([post(2)]));
		const state = createState();
		let listed: ReturnType<typeof shown> = [];
		const stop = $effect.root(() => {
			$effect(() => {
				listed = shown(state);
			});
		});
		await settle();
		flushSync();
		const detach = state.attachView();
		state.followScroll(SCROLLED);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(state.hasNewPosts).toBe(true);

		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		flushSync();

		expect(listed).toEqual([2]);
		expect(state.hasNewPosts).toBe(false);
		expect(getRightNowFeedMock).toHaveBeenCalledTimes(3);
		detach();
		stop();
	});

	it("drops a check that saw another stored location, leaving the move to followLocation", async () => {
		stored.geohash = "u0nd9h";
		getRightNowFeedMock
			.mockResolvedValueOnce(feed([post(1)]))
			.mockResolvedValueOnce(feed([post(2)]))
			.mockResolvedValueOnce(feed([post(3)]));
		const state = createState();
		await settle();
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		stored.geohash = "ezjmgt";

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(getRightNowFeedMock).toHaveBeenCalledTimes(2);
		expect(state.hasNewPosts).toBe(false);
		expect(shown(state)).toEqual([1]);

		state.followLocation("ezjmgt");
		await settle();

		expect(shown(state)).toEqual([3]);
		detach();
	});

	it("drops a check that a refresh overtook", async () => {
		const check = Promise.withResolvers<RightNowFeedResponse>();
		getRightNowFeedMock.mockResolvedValueOnce(feed([post(1)]));
		const state = createState();
		await settle();
		getRightNowFeedMock
			.mockReturnValueOnce(check.promise)
			.mockResolvedValueOnce(feed([post(3), post(1)]));
		const detach = state.attachView();
		state.followScroll(SCROLLED);
		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		await state.refresh();
		check.resolve(feed([post(2), post(1)]));
		await settle();

		expect(shown(state)).toEqual([3, 1]);
		expect(state.hasNewPosts).toBe(false);
		detach();
	});
});
