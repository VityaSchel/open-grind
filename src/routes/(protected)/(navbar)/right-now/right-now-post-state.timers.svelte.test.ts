import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	appLifecycle,
	createRightNowPostMock,
	getActiveRightNowPostMock,
	getRightNowPostEntitlementsMock,
	NoFreeRightNowPostsError,
	refreshFeedMock,
	toastMock,
} = vi.hoisted(() => ({
	appLifecycle: { active: true },
	createRightNowPostMock: vi.fn(),
	getActiveRightNowPostMock: vi.fn(),
	getRightNowPostEntitlementsMock: vi.fn(),
	NoFreeRightNowPostsError: class extends Error {},
	refreshFeedMock: vi.fn(() => Promise.resolve()),
	toastMock: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock("#lib/api/right-now/post.ts", () => ({
	createRightNowPost: createRightNowPostMock,
	getActiveRightNowPost: getActiveRightNowPostMock,
	getRightNowPostEntitlements: getRightNowPostEntitlementsMock,
	NoFreeRightNowPostsError,
	RightNowPostAlreadyRunningError: class extends Error {},
	RightNowSessionEndedError: class extends Error {},
	setRightNowPostHidden: vi.fn(),
	updateRightNowPost: vi.fn(),
}));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({ appLifecycle }));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: () => Promise.resolve({ geohash: null }),
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: (request: () => Promise<unknown>) => request(),
}));
vi.mock("#lib/grid/grid.ts", () => ({ storeLocation: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("./right-now-feed-state.svelte", () => ({
	getRightNowFeedState: () => ({ refreshOrDefer: refreshFeedMock }),
}));
import { clearAccountCaches } from "#lib/api/account-caches.ts";
import type { RightNowPostChanges } from "#lib/model/right-now/post.ts";
import {
	getRightNowPostState,
	RightNowPostState,
} from "./right-now-post-state.svelte";
import {
	EXPIRATION,
	MINUTE,
	moderatedText,
	ownPost,
	POST_ID,
	POST_LIFETIME,
	postPhoto,
	SECOND,
} from "./right-now-post-test-helpers";

type ToastOptions = { action: { label: string; onClick: () => void } };

const createdStates: RightNowPostState[] = [];

async function loadedState() {
	const state = new RightNowPostState({ profileId: 858 });
	createdStates.push(state);
	await state.load();
	return state;
}

function lastToastAction(mock: { mock: { lastCall?: unknown[] } }) {
	return (mock.mock.lastCall?.[1] as ToastOptions).action;
}

beforeEach(() => {
	clearAccountCaches();
	vi.useFakeTimers();
	vi.setSystemTime(EXPIRATION - 30 * MINUTE);
	vi.spyOn(console, "error").mockImplementation(() => {});
	appLifecycle.active = true;
	getActiveRightNowPostMock.mockReset();
	getActiveRightNowPostMock.mockResolvedValue(null);
	getRightNowPostEntitlementsMock.mockReset();
	getRightNowPostEntitlementsMock.mockResolvedValue({
		type: "GRANTED",
		count: 2,
	});
	createRightNowPostMock.mockReset();
	refreshFeedMock.mockClear();
	toastMock.mockReset();
	toastMock.error.mockReset();
});

afterEach(() => {
	for (const state of createdStates.splice(0)) state.destroy();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("RightNowPostState moderation poll", () => {
	it("polls every 10 s for the first minute, then every minute, while text waits", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ moderatedText: moderatedText() }),
		);
		const state = await loadedState();
		const detach = state.attachView();

		expect(state.pendingModeration).toBe(true);

		await vi.advanceTimersByTimeAsync(10 * SECOND - 1);
		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(1);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(50 * SECOND);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(7);

		await vi.advanceTimersByTimeAsync(MINUTE - 1);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(7);

		await vi.advanceTimersByTimeAsync(1);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(8);
		expect(toastMock).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
		detach();
	});

	it.each<[string, RightNowPostChanges]>([
		["text", { text: "Coffee at mine?" }],
		["photo", { media: [{ type: "image_v1", data: { id: 2 } }] }],
	])(
		"goes back to polling every 10 s once a new %s is saved",
		async (_, changes) => {
			getActiveRightNowPostMock.mockResolvedValue(
				ownPost({ moderatedText: moderatedText() }),
			);
			const state = await loadedState();
			const detach = state.attachView();
			await vi.advanceTimersByTimeAsync(2 * MINUTE);

			await expect(state.save({ changes })).resolves.toBe(true);
			getActiveRightNowPostMock.mockClear();
			await vi.advanceTimersByTimeAsync(10 * SECOND);

			expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();
			detach();
		},
	);

	it("polls while a photo waits for moderation", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ media: [postPhoto({ state: "PENDING" })] }),
		);
		const state = await loadedState();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(10 * SECOND);

		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("stops once moderation settles and refreshes the feed", async () => {
		getActiveRightNowPostMock
			.mockResolvedValueOnce(ownPost({ moderatedText: moderatedText() }))
			.mockResolvedValue(ownPost({ activeText: "Here for coffee" }));
		const state = await loadedState();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);
		expect(state.pendingModeration).toBe(false);
		expect(state.post?.activeText).toBe("Here for coffee");
		expect(toastMock.error).not.toHaveBeenCalled();
		expect(refreshFeedMock).toHaveBeenCalledExactlyOnceWith({
			attended: true,
		});
		detach();
	});

	it("skips polls while the app is in the background", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ moderatedText: moderatedText() }),
		);
		const state = await loadedState();
		const detach = state.attachView();
		const hidden = vi
			.spyOn(document, "hidden", "get")
			.mockReturnValue(true);

		await vi.advanceTimersByTimeAsync(30 * SECOND);
		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();

		hidden.mockRestore();
		appLifecycle.active = false;
		await vi.advanceTimersByTimeAsync(10 * SECOND);
		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();

		appLifecycle.active = true;
		await vi.advanceTimersByTimeAsync(10 * SECOND);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("stops when the view detaches", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ moderatedText: moderatedText() }),
		);
		const state = await loadedState();
		state.attachView()();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();
	});

	it("toasts each rejection once, with Why? asking for the sheet", async () => {
		getActiveRightNowPostMock
			.mockResolvedValueOnce(ownPost({ moderatedText: moderatedText() }))
			.mockResolvedValue(
				ownPost({
					moderatedText: moderatedText({
						textStatus: "MODERATION_FAILED",
						rejectReasons: ["SPAM_DISRUPT"],
					}),
					media: [postPhoto({ state: "REJECTED", reason: "Nudity" })],
				}),
			);
		const state = await loadedState();
		const sheetRequested = vi.fn();
		state.onSheetRequest(sheetRequested);
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(10 * SECOND);

		expect(state.rejected).toEqual({
			text: true,
			photo: true,
			reasons: ["Spam/disruption", "Nudity"],
		});
		expect(toastMock.error).toHaveBeenCalledOnce();
		expect(toastMock.error).toHaveBeenCalledWith(
			"Your post was rejected",
			expect.anything(),
		);

		await state.load();
		expect(toastMock.error).toHaveBeenCalledOnce();

		const action = lastToastAction(toastMock.error);
		expect(action.label).toBe("Why?");
		action.onClick();
		expect(sheetRequested).toHaveBeenCalledOnce();

		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({
				moderatedText: moderatedText({
					id: 104,
					textStatus: "MODERATION_FAILED",
				}),
			}),
		);
		await state.load();
		expect(toastMock.error).toHaveBeenCalledTimes(2);
		detach();
	});
});

describe("RightNowPostState time left", () => {
	it("ticks every second while something reads it", async () => {
		vi.setSystemTime(EXPIRATION - 5 * MINUTE);
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();
		const seen: number[] = [];
		const stopReading = $effect.root(() => {
			$effect(() => {
				seen.push(state.timeLeftMs);
			});
		});
		flushSync();

		await vi.advanceTimersByTimeAsync(SECOND);
		flushSync();

		expect(seen).toEqual([5 * MINUTE, 5 * MINUTE - SECOND]);

		stopReading();
		await vi.advanceTimersByTimeAsync(3 * SECOND);

		expect(seen).toEqual([5 * MINUTE, 5 * MINUTE - SECOND]);
	});
});

describe("RightNowPostState expiry", () => {
	const running = ownPost({
		activeText: "Hosting now",
		hosting: true,
		shareLocation: "DISTANCE_AND_MAP",
		locationRadius: 80,
		media: [postPhoto()],
	});
	const repost = {
		text: "Hosting now",
		shareLocation: "DISTANCE_AND_MAP",
		locationRadius: 80,
		media: [{ type: "image_v1", data: { id: 316 } }],
		hosting: true,
	};

	function nextPost() {
		return ownPost({
			id: POST_ID + 1,
			posted: Date.now(),
			expiration: Date.now() + POST_LIFETIME,
		});
	}

	async function endedState() {
		vi.setSystemTime(EXPIRATION - MINUTE);
		getActiveRightNowPostMock
			.mockResolvedValueOnce(running)
			.mockResolvedValue(null);
		const state = await loadedState();
		const sheetRequested = vi.fn();
		state.onSheetRequest(sheetRequested);
		const detach = state.attachView();
		await vi.advanceTimersByTimeAsync(MINUTE);
		return { state, sheetRequested, detach };
	}

	it("toasts that the session ended once the post expires", async () => {
		vi.setSystemTime(EXPIRATION - MINUTE);
		getActiveRightNowPostMock
			.mockResolvedValueOnce(running)
			.mockResolvedValue(null);
		const state = await loadedState();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(MINUTE - 1);
		expect(toastMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(state.status).toBe("none");
		expect(toastMock).toHaveBeenCalledWith(
			"Your Right Now session ended",
			expect.anything(),
		);
		expect(lastToastAction(toastMock).label).toBe("Go again");
		expect(refreshFeedMock).toHaveBeenCalledWith({ attended: true });
		expect(getRightNowPostEntitlementsMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("goes again with the last post's text, photo, hosting and location", async () => {
		const { state, sheetRequested, detach } = await endedState();
		createRightNowPostMock.mockResolvedValue(nextPost());

		lastToastAction(toastMock).onClick();
		await vi.waitFor(() => expect(sheetRequested).toHaveBeenCalledOnce());

		expect(createRightNowPostMock).toHaveBeenCalledExactlyOnceWith({
			post: repost,
		});
		expect(state.post?.id).toBe(POST_ID + 1);
		detach();
	});

	it("keeps the sheet closed and the last post when no free posts are left to go again", async () => {
		const { state, sheetRequested, detach } = await endedState();
		createRightNowPostMock.mockRejectedValue(
			new NoFreeRightNowPostsError(),
		);

		lastToastAction(toastMock).onClick();
		await vi.waitFor(() =>
			expect(toastMock.error).toHaveBeenCalledWith(
				"No free posts left in this area",
				expect.anything(),
			),
		);

		expect(sheetRequested).not.toHaveBeenCalled();
		expect(state.freePostsLeft).toBe(0);

		createRightNowPostMock.mockResolvedValue(nextPost());
		lastToastAction(toastMock).onClick();
		await vi.waitFor(() => expect(sheetRequested).toHaveBeenCalledOnce());

		expect(createRightNowPostMock.mock.calls).toEqual([
			[{ post: repost }],
			[{ post: repost }],
		]);
		detach();
	});

	it("checks again when the server still lists the post at expiry", async () => {
		vi.setSystemTime(EXPIRATION - MINUTE);
		getActiveRightNowPostMock
			.mockResolvedValueOnce(ownPost())
			.mockResolvedValueOnce(ownPost())
			.mockResolvedValue(null);
		const state = await loadedState();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(MINUTE);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);
		expect(state.status).toBe("active");

		await vi.advanceTimersByTimeAsync(10 * SECOND - 1);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);
		expect(state.status).toBe("none");
		expect(toastMock).toHaveBeenCalledOnce();
		detach();
	});

	it("spaces out rechecks up to a minute while the server keeps listing an expired post, and skips them in the background", async () => {
		vi.setSystemTime(EXPIRATION - MINUTE);
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();
		const detach = state.attachView();

		await vi.advanceTimersByTimeAsync(MINUTE);
		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);

		for (const [gap, calls] of [
			[10 * SECOND, 3],
			[20 * SECOND, 4],
			[40 * SECOND, 5],
			[MINUTE, 6],
			[MINUTE, 7],
		] as const) {
			await vi.advanceTimersByTimeAsync(gap - 1);
			expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(calls - 1);
			await vi.advanceTimersByTimeAsync(1);
			expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(calls);
		}

		appLifecycle.active = false;
		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(7);
		detach();
	});

	it("waits for a view before checking, then finds the ended session", async () => {
		vi.setSystemTime(EXPIRATION - MINUTE);
		getActiveRightNowPostMock
			.mockResolvedValueOnce(ownPost())
			.mockResolvedValue(null);
		const state = await loadedState();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);
		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();

		const detach = state.attachView();
		await vi.advanceTimersByTimeAsync(0);

		expect(state.status).toBe("none");
		expect(toastMock).toHaveBeenCalledWith(
			"Your Right Now session ended",
			expect.anything(),
		);
		detach();
	});

	it("stays quiet after sign-out", async () => {
		vi.setSystemTime(EXPIRATION - MINUTE);
		getActiveRightNowPostMock
			.mockResolvedValueOnce(ownPost())
			.mockResolvedValue(null);
		const state = getRightNowPostState(858);
		await state.load();
		state.attachView();

		clearAccountCaches();
		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();
		expect(toastMock).not.toHaveBeenCalled();
	});
});
