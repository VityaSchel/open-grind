import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	appLifecycle,
	createRightNowPostMock,
	getActiveRightNowPostMock,
	getRightNowPostEntitlementsMock,
	NoFreeRightNowPostsError,
	reconcileHandlers,
	refreshFeedMock,
	requestSheetMock,
	showErrorToastMock,
	toastMock,
} = vi.hoisted(() => ({
	appLifecycle: { active: true },
	createRightNowPostMock: vi.fn(),
	getActiveRightNowPostMock: vi.fn(),
	getRightNowPostEntitlementsMock: vi.fn(),
	NoFreeRightNowPostsError: class extends Error {},
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	refreshFeedMock: vi.fn(() => Promise.resolve()),
	requestSheetMock: vi.fn(),
	showErrorToastMock: vi.fn(),
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
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({ appLifecycle }));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: () => Promise.resolve({ geohash: null }),
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: (request: () => Promise<unknown>) => request(),
}));
vi.mock("#lib/grid/grid.ts", () => ({ storeLocation: vi.fn() }));
vi.mock("#lib/api/analytics/assignments.ts", () => ({
	isAssignmentOn: () => Promise.resolve(false),
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("#lib/components/right-now/post-sheet-request-state.svelte.ts", () => ({
	rightNowPostSheetRequest: { request: requestSheetMock },
}));
vi.mock("#lib/util/reconcile.ts", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return () => {
				reconcileHandlers.splice(reconcileHandlers.indexOf(handler), 1);
			};
		},
	},
}));
vi.mock("./right-now-feed-state.svelte", () => ({
	getRightNowFeedState: () => ({ refreshOrDefer: refreshFeedMock }),
}));
import { clearAccountCaches } from "#lib/api/account-caches.ts";
import type { RightNowPostChanges } from "#lib/model/right-now/post.ts";
import {
	destroyCreatedStates,
	loadedState,
} from "./right-now-post-state-test-helpers";
import { getRightNowPostState } from "./right-now-post-state.svelte";
import {
	EXPIRATION,
	MINUTE,
	moderatedText,
	ownPost,
	POST_ID,
	POST_LIFETIME,
	postPhoto,
	PROFILE_ID,
	SECOND,
} from "./right-now-post-test-helpers";

type ToastOptions = { action: { label: string; onClick: () => void } };

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
	reconcileHandlers.length = 0;
	refreshFeedMock.mockClear();
	requestSheetMock.mockClear();
	showErrorToastMock.mockReset();
	toastMock.mockReset();
	toastMock.error.mockReset();
});

afterEach(() => {
	destroyCreatedStates();
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
		expect(requestSheetMock).toHaveBeenCalledOnce();

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

	it("still asks for the sheet when Why? is tapped after leaving the Right Now screen", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ media: [postPhoto({ state: "REJECTED" })] }),
		);
		const state = await loadedState();
		state.attachView()();

		lastToastAction(toastMock.error).onClick();

		expect(requestSheetMock).toHaveBeenCalledOnce();
	});

	it("leaves the sheet alone when Why? is tapped after sign-out", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ media: [postPhoto({ state: "REJECTED" })] }),
		);
		await getRightNowPostState(PROFILE_ID).load();
		const why = lastToastAction(toastMock.error);
		clearAccountCaches();

		why.onClick();

		expect(requestSheetMock).not.toHaveBeenCalled();
	});
});

describe("RightNowPostState time left", () => {
	it("ticks every second while something reads it and stops its clock once nothing does", async () => {
		vi.setSystemTime(EXPIRATION - 5 * MINUTE);
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();
		const idle = vi.getTimerCount();
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
		expect(vi.getTimerCount()).toBe(idle + 1);

		stopReading();
		await vi.advanceTimersByTimeAsync(0);

		expect(vi.getTimerCount()).toBe(idle);
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
		const detach = state.attachView();
		await vi.advanceTimersByTimeAsync(MINUTE);
		return { state, sheetRequested: requestSheetMock, detach };
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

	it("opens the post sheet when a Go again that failed gets through on its toast's Retry", async () => {
		const { state, sheetRequested, detach } = await endedState();
		createRightNowPostMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue(nextPost());
		lastToastAction(toastMock).onClick();
		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledOnce(),
		);
		expect(sheetRequested).not.toHaveBeenCalled();
		const [{ onRetry }] = showErrorToastMock.mock.lastCall as [
			{ onRetry: () => void },
		];

		onRetry();
		await vi.waitFor(() => expect(sheetRequested).toHaveBeenCalledOnce());

		expect(state.post?.id).toBe(POST_ID + 1);
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
		const state = getRightNowPostState(PROFILE_ID);
		await state.load();
		state.attachView();

		clearAccountCaches();
		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();
		expect(toastMock).not.toHaveBeenCalled();
	});
});

describe("RightNowPostState on returning to the app", () => {
	const returnToApp = () => reconcileHandlers[0]?.();

	it("finds a session that ended while the app was away as soon as it is back", async () => {
		getActiveRightNowPostMock
			.mockResolvedValueOnce(ownPost())
			.mockResolvedValue(null);
		const state = await loadedState();
		const detach = state.attachView();

		await returnToApp();

		expect(state.status).toBe("none");
		expect(toastMock).toHaveBeenCalledWith(
			"Your Right Now session ended",
			expect.anything(),
		);
		expect(getRightNowPostEntitlementsMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("reads nothing on a reconnect while the window is hidden or the app is inactive, so nothing marks us online behind our back", async () => {
		const state = await loadedState();
		const detach = state.attachView();
		getActiveRightNowPostMock.mockClear();
		const hidden = vi
			.spyOn(document, "hidden", "get")
			.mockReturnValue(true);

		await returnToApp();
		expect(getActiveRightNowPostMock).not.toHaveBeenCalled();

		hidden.mockRestore();
		appLifecycle.active = false;
		await returnToApp();
		expect(getActiveRightNowPostMock).not.toHaveBeenCalled();

		appLifecycle.active = true;
		await returnToApp();
		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();
		detach();
	});

	it("reads the allowance again, so free posts that came back while away let Join through", async () => {
		getRightNowPostEntitlementsMock
			.mockResolvedValueOnce({ type: "GRANTED", count: 0 })
			.mockResolvedValue({ type: "GRANTED", count: 2 });
		const state = await loadedState();
		const detach = state.attachView();
		expect(state.freePostsLeft).toBe(0);

		await returnToApp();

		expect(state.freePostsLeft).toBe(2);
		detach();
	});

	it("leaves catching up to the next visit while the Right Now screen is not shown", async () => {
		const state = await loadedState();
		state.attachView()();
		await vi.advanceTimersByTimeAsync(0);
		getActiveRightNowPostMock.mockClear();
		getRightNowPostEntitlementsMock.mockClear();

		await returnToApp();

		expect(getActiveRightNowPostMock).not.toHaveBeenCalled();
		expect(getRightNowPostEntitlementsMock).not.toHaveBeenCalled();
	});

	it("stops listening for returns once destroyed", async () => {
		const state = await loadedState();
		expect(reconcileHandlers).toHaveLength(1);

		state.destroy();

		expect(reconcileHandlers).toHaveLength(0);
	});
});
