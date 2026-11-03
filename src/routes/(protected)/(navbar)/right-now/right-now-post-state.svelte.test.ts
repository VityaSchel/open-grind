import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	atHomeLocationMock,
	createRightNowPostMock,
	getActiveRightNowPostMock,
	getPreferencesMock,
	getRightNowPostEntitlementsMock,
	NoFreeRightNowPostsError,
	refreshFeedMock,
	RightNowPostAlreadyRunningError,
	RightNowSessionEndedError,
	setRightNowPostHiddenMock,
	showErrorToastMock,
	storeLocationMock,
	toastMock,
	updateRightNowPostMock,
} = vi.hoisted(() => ({
	atHomeLocationMock:
		vi.fn<(request: () => Promise<unknown>) => Promise<unknown>>(),
	createRightNowPostMock: vi.fn(),
	getActiveRightNowPostMock: vi.fn(),
	getPreferencesMock: vi.fn(),
	getRightNowPostEntitlementsMock: vi.fn(),
	NoFreeRightNowPostsError: class extends Error {},
	refreshFeedMock: vi.fn(() => Promise.resolve()),
	RightNowPostAlreadyRunningError: class extends Error {},
	RightNowSessionEndedError: class extends Error {},
	setRightNowPostHiddenMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	storeLocationMock: vi.fn(() => Promise.resolve()),
	toastMock: Object.assign(vi.fn(), { error: vi.fn() }),
	updateRightNowPostMock: vi.fn(),
}));

vi.mock("#lib/api/right-now/post.ts", () => ({
	createRightNowPost: createRightNowPostMock,
	getActiveRightNowPost: getActiveRightNowPostMock,
	getRightNowPostEntitlements: getRightNowPostEntitlementsMock,
	NoFreeRightNowPostsError,
	RightNowPostAlreadyRunningError,
	RightNowSessionEndedError,
	setRightNowPostHidden: setRightNowPostHiddenMock,
	updateRightNowPost: updateRightNowPostMock,
}));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({
	appLifecycle: { active: true },
}));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: getPreferencesMock,
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: atHomeLocationMock,
}));
vi.mock("#lib/grid/grid.ts", () => ({ storeLocation: storeLocationMock }));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("./right-now-feed-state.svelte", () => ({
	getRightNowFeedState: () => ({ refreshOrDefer: refreshFeedMock }),
}));
import { clearAccountCaches } from "#lib/api/account-caches.ts";
import {
	getRightNowPostState,
	RightNowPostState,
} from "./right-now-post-state.svelte";
import {
	MINUTE,
	moderatedText,
	ownPost,
	POST_ID,
	postPhoto,
} from "./right-now-post-test-helpers";

const BERLIN = "u33dc0cpgp00";
const MUNICH = "u281z7j5c0e0";
const PROFILE_ID = 858;
const JOIN_BODY = { shareLocation: "NONE", media: [], hosting: false };

type OwnPost = ReturnType<typeof ownPost>;

const createdStates: RightNowPostState[] = [];

function createState() {
	const state = new RightNowPostState({ profileId: PROFILE_ID });
	createdStates.push(state);
	return state;
}

async function loadedState() {
	const state = createState();
	await state.load();
	return state;
}

beforeEach(() => {
	clearAccountCaches();
	vi.spyOn(console, "error").mockImplementation(() => {});
	atHomeLocationMock.mockReset();
	atHomeLocationMock.mockImplementation((request) => request());
	getPreferencesMock.mockReset();
	getPreferencesMock.mockResolvedValue({ geohash: BERLIN });
	storeLocationMock.mockClear();
	getActiveRightNowPostMock.mockReset();
	getActiveRightNowPostMock.mockResolvedValue(null);
	getRightNowPostEntitlementsMock.mockReset();
	getRightNowPostEntitlementsMock.mockResolvedValue({
		type: "GRANTED",
		count: 3,
	});
	createRightNowPostMock.mockReset();
	createRightNowPostMock.mockResolvedValue(ownPost());
	updateRightNowPostMock.mockReset();
	updateRightNowPostMock.mockResolvedValue(undefined);
	setRightNowPostHiddenMock.mockReset();
	setRightNowPostHiddenMock.mockResolvedValue(undefined);
	refreshFeedMock.mockClear();
	showErrorToastMock.mockReset();
	toastMock.mockReset();
	toastMock.error.mockReset();
});

afterEach(() => {
	for (const state of createdStates.splice(0)) state.destroy();
	vi.restoreAllMocks();
});

describe("RightNowPostState load", () => {
	it("reads the running post and the allowance at the stored location", async () => {
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		getRightNowPostEntitlementsMock.mockResolvedValue({
			type: "GRANTED",
			count: 2,
		});

		const state = await loadedState();

		expect(state.post?.id).toBe(POST_ID);
		expect(state.status).toBe("active");
		expect(state.freePostsLeft).toBe(2);
		expect(state.loading).toBe(false);
		expect(storeLocationMock).toHaveBeenCalledWith({ geohash: BERLIN });
		expect(storeLocationMock).toHaveBeenCalledBefore(
			getRightNowPostEntitlementsMock,
		);
	});

	it("reads the allowance only once the location hold lets it run", async () => {
		atHomeLocationMock.mockReturnValue(new Promise(() => {}));
		const state = createState();

		void state.load();
		await vi.waitFor(() =>
			expect(getActiveRightNowPostMock).toHaveBeenCalled(),
		);

		expect(atHomeLocationMock).toHaveBeenCalled();
		expect(storeLocationMock).not.toHaveBeenCalled();
		expect(getRightNowPostEntitlementsMock).not.toHaveBeenCalled();
	});

	it("reads an unlimited allowance", async () => {
		getRightNowPostEntitlementsMock.mockResolvedValue({
			type: "UNLIMITED",
		});

		const state = await loadedState();

		expect(state.freePostsLeft).toBe("unlimited");
		expect(state.status).toBe("none");
	});

	it("shows a hidden post as off", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ postStatus: "HIDDEN" }),
		);

		const state = await loadedState();

		expect(state.status).toBe("off");
	});

	it("loads again on the next attach after a failed read", async () => {
		getActiveRightNowPostMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(
				ownPost({ expiration: Date.now() + 60 * MINUTE }),
			);
		const state = await loadedState();

		expect(state.loading).toBe(false);
		expect(state.post).toBeNull();

		const detach = state.attachView();
		await vi.waitFor(() => expect(state.post?.id).toBe(POST_ID));

		expect(getActiveRightNowPostMock).toHaveBeenCalledTimes(2);
		detach();
	});

	it("reads the post and the allowance again when a view comes back", async () => {
		getRightNowPostEntitlementsMock.mockResolvedValue({
			type: "GRANTED",
			count: 0,
		});
		const state = await loadedState();
		state.attachView()();

		expect(getActiveRightNowPostMock).toHaveBeenCalledOnce();

		getRightNowPostEntitlementsMock.mockResolvedValue({
			type: "GRANTED",
			count: 2,
		});
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const detach = state.attachView();

		await vi.waitFor(() => {
			expect(state.freePostsLeft).toBe(2);
			expect(state.post?.id).toBe(POST_ID);
		});
		detach();
	});

	it("rereads the allowance when the location changes without a post", async () => {
		const state = await loadedState();
		state.followLocation(BERLIN);
		getRightNowPostEntitlementsMock.mockResolvedValue({
			type: "GRANTED",
			count: 0,
		});

		state.followLocation(BERLIN);
		state.followLocation(MUNICH);

		await vi.waitFor(() => expect(state.freePostsLeft).toBe(0));
		expect(getRightNowPostEntitlementsMock).toHaveBeenCalledTimes(2);
	});

	it("lists each rejection reason once", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({
				moderatedText: moderatedText({
					textStatus: "MODERATION_FAILED",
					rejectReasons: ["OTHER", "SOME_NEW_CODE"],
				}),
				media: [
					postPhoto({
						mediaId: 1,
						state: "REJECTED",
						reason: "Nudity",
					}),
					postPhoto({
						mediaId: 2,
						state: "REJECTED",
						reason: "Nudity",
					}),
				],
			}),
		);

		const state = await loadedState();

		expect(state.rejected.reasons).toEqual(["Other", "Nudity"]);
	});
});

describe("RightNowPostState join", () => {
	it("creates an empty post inside the location hold and refreshes the feed", async () => {
		const state = await loadedState();
		storeLocationMock.mockClear();

		await expect(state.join()).resolves.toBe(true);

		expect(createRightNowPostMock).toHaveBeenCalledWith({
			post: JOIN_BODY,
		});
		expect(storeLocationMock).toHaveBeenCalledWith({ geohash: BERLIN });
		expect(storeLocationMock).toHaveBeenCalledBefore(
			createRightNowPostMock,
		);
		expect(state.post?.id).toBe(POST_ID);
		expect(state.status).toBe("active");
		expect(state.freePostsLeft).toBe(2);
		expect(state.joining).toBe(false);
		expect(refreshFeedMock).toHaveBeenCalledWith({ attended: true });
	});

	it("shows joining while the post is created", async () => {
		const state = await loadedState();
		const created = Promise.withResolvers<OwnPost>();
		createRightNowPostMock.mockReturnValue(created.promise);

		const joined = state.join();
		await vi.waitFor(() =>
			expect(createRightNowPostMock).toHaveBeenCalled(),
		);

		expect(state.joining).toBe(true);
		await expect(state.join()).resolves.toBe(false);

		created.resolve(ownPost());
		await expect(joined).resolves.toBe(true);
		expect(createRightNowPostMock).toHaveBeenCalledOnce();
	});

	it("keeps the new post when an earlier post read finishes empty after the join", async () => {
		const read = Promise.withResolvers<OwnPost | null>();
		getActiveRightNowPostMock.mockReturnValueOnce(read.promise);
		const state = createState();

		const loaded = state.load();
		await expect(state.join()).resolves.toBe(true);
		read.resolve(null);
		await loaded;

		expect(state.post?.id).toBe(POST_ID);
		expect(toastMock).not.toHaveBeenCalled();
	});

	it("never creates a second post while one is running", async () => {
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();

		await expect(state.join()).resolves.toBe(false);

		expect(createRightNowPostMock).not.toHaveBeenCalled();
	});

	it("says no free posts are left and never retries", async () => {
		const state = await loadedState();
		createRightNowPostMock.mockRejectedValue(
			new NoFreeRightNowPostsError(),
		);

		await expect(state.join()).resolves.toBe(false);

		expect(state.freePostsLeft).toBe(0);
		expect(state.post).toBeNull();
		expect(toastMock.error).toHaveBeenCalledWith(
			"No free posts left in this area",
			expect.anything(),
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
		expect(createRightNowPostMock).toHaveBeenCalledOnce();
		expect(refreshFeedMock).not.toHaveBeenCalled();
	});

	it("shows the post that is already running", async () => {
		const state = await loadedState();
		createRightNowPostMock.mockRejectedValue(
			new RightNowPostAlreadyRunningError(),
		);
		getActiveRightNowPostMock.mockResolvedValue(ownPost());

		await expect(state.join()).resolves.toBe(false);

		expect(state.post?.id).toBe(POST_ID);
		expect(toastMock).toHaveBeenCalledWith(
			"You already have a post running",
			expect.anything(),
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("offers a retry for any other failure", async () => {
		const state = await loadedState();
		const failure = new Error("offline");
		createRightNowPostMock.mockRejectedValueOnce(failure);

		await expect(state.join()).resolves.toBe(false);

		expect(showErrorToastMock).toHaveBeenCalledWith(
			expect.objectContaining({
				label: "Failed to join Right Now",
				error: failure,
			}),
		);
		const [{ onRetry }] = showErrorToastMock.mock.lastCall as [
			{ onRetry: () => void },
		];
		onRetry();
		await vi.waitFor(() => expect(state.post?.id).toBe(POST_ID));
		expect(createRightNowPostMock).toHaveBeenCalledTimes(2);
	});
});

describe("RightNowPostState save", () => {
	it("sends the changes after the join and reads the post back", async () => {
		const state = await loadedState();
		await state.join();
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({
				activeText: "Here for coffee",
				shareLocation: "DISTANCE_AND_MAP",
				locationRadius: 100,
			}),
		);

		await expect(
			state.save({
				changes: {
					text: "Here for coffee",
					shareLocation: "DISTANCE_AND_MAP",
					locationRadius: 100,
				},
			}),
		).resolves.toBe(true);

		expect(updateRightNowPostMock).toHaveBeenCalledExactlyOnceWith({
			postId: POST_ID,
			changes: {
				text: "Here for coffee",
				shareLocation: "DISTANCE_AND_MAP",
				locationRadius: 100,
			},
		});
		expect(state.post?.activeText).toBe("Here for coffee");
		expect(state.saving).toBe(false);
		expect(refreshFeedMock).toHaveBeenCalledTimes(2);
	});

	it("ends the session instead of offering a retry when the post is already over", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ hosting: false }),
		);
		const state = await loadedState();
		updateRightNowPostMock.mockRejectedValueOnce(
			new RightNowSessionEndedError(),
		);
		getActiveRightNowPostMock.mockResolvedValue(null);

		await expect(state.save({ changes: { hosting: true } })).resolves.toBe(
			false,
		);

		expect(state.status).toBe("none");
		expect(toastMock).toHaveBeenCalledWith(
			"Your Right Now session ended",
			expect.anything(),
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("skips the request when nothing changed", async () => {
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();

		await expect(state.save({ changes: {} })).resolves.toBe(true);

		expect(updateRightNowPostMock).not.toHaveBeenCalled();
	});

	it("offers a retry when the edit fails", async () => {
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();
		updateRightNowPostMock.mockRejectedValueOnce(new Error("offline"));

		await expect(state.save({ changes: { hosting: true } })).resolves.toBe(
			false,
		);

		expect(showErrorToastMock).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to save your post" }),
		);
		expect(state.post?.hosting).toBe(false);
		expect(state.saving).toBe(false);
		expect(refreshFeedMock).not.toHaveBeenCalled();
	});
});

describe("RightNowPostState setHidden", () => {
	it("turns the post off and back on", async () => {
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ postStatus: "HIDDEN" }),
		);

		await expect(state.setHidden({ hidden: true })).resolves.toBe(true);

		expect(setRightNowPostHiddenMock).toHaveBeenLastCalledWith({
			postId: POST_ID,
			hidden: true,
		});
		expect(state.status).toBe("off");

		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		await expect(state.setHidden({ hidden: false })).resolves.toBe(true);

		expect(setRightNowPostHiddenMock).toHaveBeenLastCalledWith({
			postId: POST_ID,
			hidden: false,
		});
		expect(state.status).toBe("active");
		expect(refreshFeedMock).toHaveBeenCalledTimes(2);
	});

	it("shows the post as off even when the refetch fails", async () => {
		getActiveRightNowPostMock.mockResolvedValue(ownPost());
		const state = await loadedState();
		getActiveRightNowPostMock.mockRejectedValue(new Error("offline"));

		await expect(state.setHidden({ hidden: true })).resolves.toBe(true);

		expect(state.status).toBe("off");
	});

	it("ends the session when the server says it is over", async () => {
		getActiveRightNowPostMock.mockResolvedValue(
			ownPost({ postStatus: "HIDDEN" }),
		);
		const state = await loadedState();
		setRightNowPostHiddenMock.mockRejectedValue(
			new RightNowSessionEndedError(),
		);
		getActiveRightNowPostMock.mockResolvedValue(null);

		await expect(state.setHidden({ hidden: false })).resolves.toBe(false);

		expect(state.status).toBe("none");
		expect(toastMock).toHaveBeenCalledWith(
			"Your Right Now session ended",
			expect.anything(),
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});
});

describe("RightNowPostState sign-out", () => {
	it("drops a post read that finishes after sign-out", async () => {
		const read = Promise.withResolvers<OwnPost | null>();
		getActiveRightNowPostMock.mockReturnValue(read.promise);
		const state = createState();

		const loaded = state.load();
		clearAccountCaches();
		read.resolve(ownPost());
		await loaded;

		expect(state.post).toBeNull();
	});

	it("never creates a post once signed out while the location hold waits", async () => {
		const state = await loadedState();
		const hold = Promise.withResolvers<void>();
		atHomeLocationMock.mockImplementationOnce((request) =>
			hold.promise.then(request),
		);

		const joined = state.join();
		clearAccountCaches();
		hold.resolve();

		await expect(joined).resolves.toBe(false);
		expect(createRightNowPostMock).not.toHaveBeenCalled();
		expect(showErrorToastMock).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("drops a created post when sign-out happens mid-request", async () => {
		const state = await loadedState();
		const created = Promise.withResolvers<OwnPost>();
		createRightNowPostMock.mockReturnValue(created.promise);

		const joined = state.join();
		await vi.waitFor(() =>
			expect(createRightNowPostMock).toHaveBeenCalled(),
		);
		clearAccountCaches();
		created.resolve(ownPost());

		await expect(joined).resolves.toBe(false);
		expect(state.post).toBeNull();
		expect(refreshFeedMock).not.toHaveBeenCalled();
	});

	it("keeps one state per account", () => {
		const first = getRightNowPostState(PROFILE_ID);

		expect(getRightNowPostState(PROFILE_ID)).toBe(first);

		clearAccountCaches();

		expect(getRightNowPostState(PROFILE_ID)).not.toBe(first);
	});
});
