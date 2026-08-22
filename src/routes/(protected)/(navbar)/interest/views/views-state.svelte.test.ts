import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAccountPreferencesMock,
	getViewsMock,
	markBlockedProfilesUnviewableMock,
	reconcileHandlers,
	setAccountPreferencesMock,
	showErrorToastMock,
	subscriptions,
	unlistenViewMock,
	unsubscribeReconcileMock,
	viewHandlers,
} = vi.hoisted(() => ({
	getAccountPreferencesMock: vi.fn(),
	getViewsMock: vi.fn(),
	markBlockedProfilesUnviewableMock: vi.fn(() => Promise.resolve()),
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	setAccountPreferencesMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	subscriptions: [] as {
		eventType: string;
		schema: { parse(payload: unknown): unknown };
	}[],
	unlistenViewMock: vi.fn(),
	unsubscribeReconcileMock: vi.fn(),
	viewHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/views", () => ({ getViews: getViewsMock }));
vi.mock("$lib/api/settings/account", () => ({
	getAccountPreferences: getAccountPreferencesMock,
	setAccountPreferences: setAccountPreferencesMock,
}));
vi.mock("$lib/api/browse/blocks", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/browse/blocks")>()),
	markBlockedProfilesUnviewable: markBlockedProfilesUnviewableMock,
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return unsubscribeReconcileMock;
		},
	},
}));
import { clearAccountCaches } from "$lib/api/account-caches";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import type { ViewerProfile, ViewPreview } from "$lib/model/interest/views";
import { getViewsState, ViewsState } from "./views-state.svelte";

vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(
			eventType: string,
			schema: { parse(payload: unknown): unknown },
			handler: (event: unknown) => void,
		) {
			if (eventType === "viewed_me.v1.new_view_received") {
				subscriptions.push({ eventType, schema });
				viewHandlers.push(handler);
			}
			return Promise.resolve(unlistenViewMock);
		},
	},
}));

function emitView(payload: unknown) {
	const subscription = subscriptions.find(
		({ eventType }) => eventType === "viewed_me.v1.new_view_received",
	);
	if (!subscription) throw new Error("view subscription was not registered");
	viewHandlers[0]?.(subscription.schema.parse(payload));
}

function profile(
	profileId: number,
	overrides: Partial<ViewerProfile> = {},
): ViewerProfile {
	return {
		distance: null,
		profileImageMediaHash: null,
		isFavorite: false,
		lastViewed: 1_710_000_000_000 + profileId,
		isSecretAdmirer: false,
		viewedCount: { totalCount: 1, maxDisplayCount: 99 },
		profileId,
		displayName: `Profile ${profileId}`,
		onlineUntil: null,
		...overrides,
	};
}

function preview(overrides: Partial<ViewPreview> = {}): ViewPreview {
	return {
		distance: null,
		profileImageMediaHash: null,
		isFavorite: false,
		lastViewed: 1_710_000_000_000,
		isSecretAdmirer: true,
		viewedCount: { totalCount: 3, maxDisplayCount: 99 },
		...overrides,
	};
}

async function waitForLoaded(state: ViewsState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function viewEvent(profileId: number) {
	return {
		type: "viewed_me.v1.new_view_received",
		notificationId: null,
		ref: null,
		payload: {
			viewedCount: 1,
			mostRecent: {
				profileId,
				photoHash: null,
				timestamp: 1_710_000_000_000 + profileId,
			},
		},
	};
}

type ViewsSnapshot = { profiles: ViewerProfile[]; previews: ViewPreview[] };

beforeEach(() => {
	clearAccountCaches();
	getAccountPreferencesMock.mockReset();
	getAccountPreferencesMock.mockResolvedValue({ hideViewedMe: false });
	setAccountPreferencesMock.mockReset();
	setAccountPreferencesMock.mockResolvedValue(undefined);
	getViewsMock.mockReset();
	markBlockedProfilesUnviewableMock.mockClear();
	showErrorToastMock.mockReset();
	unlistenViewMock.mockReset();
	unsubscribeReconcileMock.mockReset();
	reconcileHandlers.length = 0;
	subscriptions.length = 0;
	viewHandlers.length = 0;
});

describe("ViewsState", () => {
	it("loads profiles before previews and pages visible results", async () => {
		getViewsMock.mockResolvedValue({
			profiles: Array.from({ length: 24 }, (_, index) =>
				profile(index + 1),
			),
			previews: [preview()],
		});

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(state.views).toHaveLength(24);
		expect(state.views[0]).toMatchObject({ type: "profile" });
		expect(state.hasMore).toBe(true);

		state.loadMore();

		expect(state.views).toHaveLength(25);
		expect(state.views[24]).toMatchObject({ type: "preview" });
		expect(state.hasMore).toBe(false);
	});

	it("records initial load errors and retries", async () => {
		getViewsMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ profiles: [profile(1)], previews: [] });

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.error?.message).toBe("offline");

		state.retry();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(state.views).toHaveLength(1);
	});

	it("upserts websocket views while preserving known profile fields", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [
				profile(1, {
					displayName: "Known",
					distance: 120,
					isFavorite: true,
					viewedCount: { totalCount: 4, maxDisplayCount: 99 },
				}),
			],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		emitView({
			type: "viewed_me.v1.new_view_received",
			notificationId: null,
			ref: null,
			payload: {
				viewedCount: 1,
				mostRecent: {
					profileId: 1,
					photoHash: "a".repeat(40),
					timestamp: 1_710_000_001_000,
				},
			},
		});

		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: {
				profileId: 1,
				displayName: "Known",
				distance: 120,
				isFavorite: true,
				viewedCount: { totalCount: 5, maxDisplayCount: 99 },
			},
		});
	});

	it("reconciles after initial load and reports refresh failures", async () => {
		getViewsMock
			.mockResolvedValueOnce({ profiles: [profile(1)], previews: [] })
			.mockResolvedValueOnce({ profiles: [profile(2)], previews: [] })
			.mockRejectedValueOnce(new Error("refresh failed"));
		const state = new ViewsState();
		await waitForLoaded(state);

		await reconcileHandlers[0]?.();

		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: { profileId: 2 },
		});

		await reconcileHandlers[0]?.();

		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "Failed to refresh views",
			error: expect.any(Error),
		});
	});

	it("keeps a websocket view that lands while a reconcile fetch is in flight", async () => {
		getViewsMock.mockResolvedValueOnce({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		const gate = deferred<ViewsSnapshot>();
		getViewsMock.mockReturnValueOnce(gate.promise);

		const reconcilePromise = reconcileHandlers[0]?.();
		emitView(viewEvent(5));
		gate.resolve({ profiles: [profile(1), profile(2)], previews: [] });
		await reconcilePromise;

		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: { profileId: 5 },
		});
	});

	it("does not double-count a mid-fetch view already in the snapshot", async () => {
		getViewsMock.mockResolvedValueOnce({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		const gate = deferred<ViewsSnapshot>();
		getViewsMock.mockReturnValueOnce(gate.promise);

		const reconcilePromise = reconcileHandlers[0]?.();
		emitView(viewEvent(2));
		gate.resolve({
			profiles: [
				profile(1),
				profile(2, {
					viewedCount: { totalCount: 7, maxDisplayCount: 99 },
				}),
			],
			previews: [],
		});
		await reconcilePromise;

		const twos = state.views.filter(
			(v) => v.type === "profile" && v.profile.profileId === 2,
		);
		expect(twos).toHaveLength(1);
		expect(twos[0]).toMatchObject({
			type: "profile",
			profile: { viewedCount: { totalCount: 7 } },
		});
	});

	it("follows a favorite change made elsewhere, and stops after destroy", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		mergeProfileEditIntoCaches({
			cacheProfileId: 1,
			patch: { isFavorite: true },
		});
		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: { isFavorite: true },
		});

		state.destroy();
		mergeProfileEditIntoCaches({
			cacheProfileId: 1,
			patch: { isFavorite: false },
		});

		expect(state.views[0]).toMatchObject({
			type: "profile",
			profile: { isFavorite: true },
		});
	});

	it("drops a viewer who turned out to be unviewable, and keeps it dropped", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1), profile(2)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		markProfileUnviewable(1);

		expect(state.views.map((entry) => entry.key)).toEqual(["profile:2"]);

		emitView(viewEvent(1));

		expect(state.views.map((entry) => entry.key)).toEqual(["profile:2"]);

		await reconcileHandlers[0]?.();

		expect(state.views.map((entry) => entry.key)).toEqual(["profile:2"]);
	});

	it("catches up on blocks made before this session on every load", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		expect(markBlockedProfilesUnviewableMock).toHaveBeenCalledOnce();

		await reconcileHandlers[0]?.();

		expect(markBlockedProfilesUnviewableMock).toHaveBeenCalledTimes(2);
	});

	it("brings a viewer back when they are unblocked", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		markProfileUnviewable(1);

		expect(state.views).toEqual([]);

		markProfileViewable(1);
		await vi.waitFor(() =>
			expect(state.views.map((entry) => entry.key)).toEqual([
				"profile:1",
			]),
		);
	});

	it("drops a viewer marked while a reconcile fetch is in flight", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		const pending = deferred<ViewsSnapshot>();
		getViewsMock.mockReturnValueOnce(pending.promise);
		const reconciled = reconcileHandlers[0]?.();
		markProfileUnviewable(1);
		pending.resolve({ profiles: [profile(1)], previews: [] });
		await reconciled;

		expect(state.views).toEqual([]);
	});

	it("cleans up subscriptions on destroy", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});
		const state = new ViewsState();
		await waitForLoaded(state);

		state.destroy();
		emitView({
			type: "viewed_me.v1.new_view_received",
			notificationId: null,
			ref: null,
			payload: {
				viewedCount: 1,
				mostRecent: {
					profileId: 2,
					photoHash: null,
					timestamp: 1_710_000_002_000,
				},
			},
		});

		markProfileUnviewable(1);

		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(unlistenViewMock).toHaveBeenCalledOnce());
		expect(state.views).toHaveLength(1);
	});
});

describe("getViewsState", () => {
	it("keeps one loaded state per account across revisits", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});

		const state = getViewsState(99);
		await waitForLoaded(state);
		state.scrollY = 320;

		const revisited = getViewsState(99);
		revisited.load();

		expect(revisited).toBe(state);
		expect(revisited.scrollY).toBe(320);
		expect(getViewsMock).toHaveBeenCalledTimes(1);

		clearAccountCaches();

		expect(getViewsState(99)).not.toBe(state);
		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
	});
});

describe("ViewsState viewed-me tracking", () => {
	it("asks about the setting only when the list comes back empty", async () => {
		getViewsMock.mockResolvedValue({
			profiles: [profile(1)],
			previews: [],
		});

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(getAccountPreferencesMock).not.toHaveBeenCalled();
		expect(state.viewedMeHidden).toBe(false);
	});

	it("explains an empty list that the setting is hiding", async () => {
		getViewsMock.mockResolvedValue({ profiles: [], previews: [] });
		getAccountPreferencesMock.mockResolvedValue({ hideViewedMe: true });

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.views).toEqual([]);
		expect(state.viewedMeHidden).toBe(true);
	});

	it("stays loading until the setting answer arrives", async () => {
		getViewsMock.mockResolvedValue({ profiles: [], previews: [] });
		const gate = deferred<{ hideViewedMe: boolean }>();
		getAccountPreferencesMock.mockReturnValueOnce(gate.promise);

		const state = new ViewsState();
		await vi.waitFor(() =>
			expect(getAccountPreferencesMock).toHaveBeenCalledOnce(),
		);

		expect(state.loading).toBe(true);

		gate.resolve({ hideViewedMe: true });
		await waitForLoaded(state);

		expect(state.viewedMeHidden).toBe(true);
	});

	it("keeps the last known answer when the setting request fails", async () => {
		getViewsMock.mockResolvedValue({ profiles: [], previews: [] });
		getAccountPreferencesMock
			.mockResolvedValueOnce({ hideViewedMe: true })
			.mockRejectedValueOnce(new Error("offline"));

		const state = new ViewsState();
		await waitForLoaded(state);

		expect(state.viewedMeHidden).toBe(true);

		await reconcileHandlers[0]?.();

		expect(state.viewedMeHidden).toBe(true);
	});

	it("turns the setting on and shows the refetched viewers", async () => {
		getViewsMock
			.mockResolvedValueOnce({ profiles: [], previews: [] })
			.mockResolvedValueOnce({ profiles: [profile(1)], previews: [] });
		getAccountPreferencesMock.mockResolvedValue({ hideViewedMe: true });

		const state = new ViewsState();
		await waitForLoaded(state);
		await state.enableViewedMeTracking();

		expect(setAccountPreferencesMock).toHaveBeenCalledWith({
			hideViewedMe: false,
		});
		expect(state.viewedMeHidden).toBe(false);
		expect(state.views.map((entry) => entry.key)).toEqual(["profile:1"]);
		expect(state.enablingViewedMe).toBe(false);
	});

	it("stays busy from the setting write until the refetch lands", async () => {
		getViewsMock.mockResolvedValueOnce({ profiles: [], previews: [] });
		getAccountPreferencesMock.mockResolvedValue({ hideViewedMe: true });

		const state = new ViewsState();
		await waitForLoaded(state);

		const written = deferred<void>();
		setAccountPreferencesMock.mockReturnValueOnce(written.promise);
		const refetched = deferred<ViewsSnapshot>();
		getViewsMock.mockReturnValueOnce(refetched.promise);

		const enabling = state.enableViewedMeTracking();

		expect(state.enablingViewedMe).toBe(true);

		written.resolve();
		await vi.waitFor(() => expect(getViewsMock).toHaveBeenCalledTimes(2));

		expect(state.enablingViewedMe).toBe(true);

		refetched.resolve({ profiles: [profile(1)], previews: [] });
		await enabling;

		expect(state.enablingViewedMe).toBe(false);
	});

	it("reports a failed write and keeps the placeholder", async () => {
		getViewsMock.mockResolvedValue({ profiles: [], previews: [] });
		getAccountPreferencesMock.mockResolvedValue({ hideViewedMe: true });
		setAccountPreferencesMock.mockRejectedValueOnce(new Error("rejected"));

		const state = new ViewsState();
		await waitForLoaded(state);
		await state.enableViewedMeTracking();

		expect(getViewsMock).toHaveBeenCalledOnce();
		expect(state.viewedMeHidden).toBe(true);
		expect(state.enablingViewedMe).toBe(false);
		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "Failed to turn on the Viewed Me List",
			error: expect.any(Error),
		});
	});
});
