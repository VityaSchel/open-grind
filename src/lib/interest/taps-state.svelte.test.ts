import { flushSync } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getReceivedTapsMock,
	markBlockedProfilesUnviewableMock,
	reconcileHandlers,
	showErrorToastMock,
	subscriptions,
	tapHandlers,
	unsubscribeReconcileMock,
	unlistenTapMock,
} = vi.hoisted(() => ({
	getReceivedTapsMock: vi.fn(),
	markBlockedProfilesUnviewableMock: vi.fn(() => Promise.resolve()),
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	showErrorToastMock: vi.fn(),
	subscriptions: [] as {
		eventType: string;
		schema: { parse(payload: unknown): unknown };
	}[],
	tapHandlers: [] as ((event: unknown) => void)[],
	unsubscribeReconcileMock: vi.fn(),
	unlistenTapMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/taps", () => ({
	getReceivedTaps: getReceivedTapsMock,
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
import type { TapProfile } from "$lib/model/interest/tap-profile";
import { getTapsState, TapsState } from "./taps-state.svelte";

vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(
			eventType: string,
			schema: { parse(payload: unknown): unknown },
			handler: (event: unknown) => void,
		) {
			if (eventType === "tap.v1.tap_sent") {
				subscriptions.push({ eventType, schema });
				tapHandlers.push(handler);
			}
			return Promise.resolve(unlistenTapMock);
		},
	},
}));

function emitTap(payload: unknown) {
	const subscription = subscriptions.find(
		({ eventType }) => eventType === "tap.v1.tap_sent",
	);
	if (!subscription) throw new Error("tap subscription was not registered");
	tapHandlers[0]?.(subscription.schema.parse(payload));
}

function tap(
	profileId: number,
	overrides: Partial<TapProfile> = {},
): TapProfile {
	return {
		distance: null,
		profileImageMediaHash: null,
		isFavorite: false,
		profileId,
		displayName: `Profile ${profileId}`,
		timestamp: 1_710_000_000_000 + profileId,
		tapType: 0,
		lastOnline: 1_710_000_000_000,
		isBoosting: false,
		isMutual: false,
		rightNowType: "",
		isViewable: true,
		...overrides,
	};
}

async function waitForLoaded(state: TapsState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function tapEvent(senderId: number, recipientId: number) {
	return {
		type: "tap.v1.tap_sent",
		notificationId: null,
		ref: null,
		payload: {
			timestamp: 1_710_000_000_000 + senderId,
			senderId,
			recipientId,
			tapType: 0,
			senderProfileImageHash: null,
			senderDisplayName: `Profile ${senderId}`,
			isMutual: false,
		},
	};
}

beforeEach(() => {
	clearAccountCaches();
	localStorage.clear();
	getReceivedTapsMock.mockReset();
	markBlockedProfilesUnviewableMock.mockClear();
	showErrorToastMock.mockReset();
	unsubscribeReconcileMock.mockReset();
	unlistenTapMock.mockReset();
	reconcileHandlers.length = 0;
	subscriptions.length = 0;
	tapHandlers.length = 0;
});

describe("TapsState", () => {
	it("loads taps and pages visible results", async () => {
		getReceivedTapsMock.mockResolvedValue({
			profiles: Array.from({ length: 21 }, (_, index) => tap(index + 1)),
		});

		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(state.taps).toHaveLength(20);
		expect(state.hasMore).toBe(true);

		state.loadMore();

		expect(state.taps).toHaveLength(21);
		expect(state.hasMore).toBe(false);
	});

	it("stars a tap when its profile is favorited elsewhere", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);
		expect(state.taps[0]?.isFavorite).toBe(false);

		mergeProfileEditIntoCaches({
			cacheProfileId: 1,
			patch: { isFavorite: true },
		});

		expect(state.taps[0]?.isFavorite).toBe(true);
	});

	it("stops following profile edits once destroyed", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);
		state.destroy();

		mergeProfileEditIntoCaches({
			cacheProfileId: 1,
			patch: { isFavorite: true },
		});

		expect(state.taps[0]?.isFavorite).toBe(false);
	});

	it("keeps a known star when the same profile taps again", async () => {
		getReceivedTapsMock.mockResolvedValue({
			profiles: [tap(1, { isFavorite: true })],
		});
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		emitTap(tapEvent(1, 99));

		expect(state.taps[0]?.isFavorite).toBe(true);
	});

	it("records initial load errors and retries", async () => {
		getReceivedTapsMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ profiles: [tap(1)] });

		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		expect(state.error?.message).toBe("offline");

		state.retry();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(state.taps).toEqual([tap(1)]);
	});

	it("upserts websocket taps only for the current recipient", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		emitTap({
			type: "tap.v1.tap_sent",
			notificationId: null,
			ref: null,
			payload: {
				timestamp: 1_710_000_000_500,
				senderId: 2,
				recipientId: 7,
				tapType: 1,
				senderProfileImageHash: null,
				senderDisplayName: "Ignored",
				isMutual: false,
			},
		});

		expect(state.taps.map((entry) => entry.profileId)).toEqual([1]);

		emitTap({
			type: "tap.v1.tap_sent",
			notificationId: null,
			ref: null,
			payload: {
				timestamp: 1_710_000_001_000,
				senderId: 1,
				recipientId: 99,
				tapType: 2,
				senderProfileImageHash: null,
				senderDisplayName: "Updated",
				isMutual: true,
			},
		});

		expect(state.taps).toHaveLength(1);
		expect(state.taps[0]).toMatchObject({
			profileId: 1,
			displayName: "Updated",
			tapType: 2,
			isMutual: true,
		});
	});

	it("keeps a websocket tap that lands while a reconcile fetch is in flight", async () => {
		getReceivedTapsMock.mockResolvedValueOnce({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		const gate = deferred<{ profiles: TapProfile[] }>();
		getReceivedTapsMock.mockReturnValueOnce(gate.promise);

		const reconcilePromise = reconcileHandlers[0]?.();
		emitTap(tapEvent(5, 99));
		gate.resolve({ profiles: [tap(1), tap(2)] });
		await reconcilePromise;

		const ids = state.taps.map((entry) => entry.profileId);
		expect(ids).toEqual([5, 1, 2]);
	});

	it("does not duplicate a mid-fetch tap already in the snapshot", async () => {
		getReceivedTapsMock.mockResolvedValueOnce({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		const gate = deferred<{ profiles: TapProfile[] }>();
		getReceivedTapsMock.mockReturnValueOnce(gate.promise);

		const reconcilePromise = reconcileHandlers[0]?.();
		emitTap(tapEvent(2, 99));
		gate.resolve({ profiles: [tap(1), tap(2)] });
		await reconcilePromise;

		const ids = state.taps.map((entry) => entry.profileId);
		expect(ids.filter((id) => id === 2)).toHaveLength(1);
		expect(ids).toEqual([1, 2]);
	});

	it("drops a tap sender who turned out to be unviewable, and keeps it dropped", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1), tap(2)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		markProfileUnviewable(1);

		expect(state.taps.map((entry) => entry.profileId)).toEqual([2]);

		emitTap(tapEvent(1, 99));

		expect(state.taps.map((entry) => entry.profileId)).toEqual([2]);

		await reconcileHandlers[0]?.();

		expect(state.taps.map((entry) => entry.profileId)).toEqual([2]);
	});

	it("catches up on blocks made before this session on every load", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		expect(markBlockedProfilesUnviewableMock).toHaveBeenCalledOnce();

		await reconcileHandlers[0]?.();

		expect(markBlockedProfilesUnviewableMock).toHaveBeenCalledTimes(2);
	});

	it("brings a tap sender back when they are unblocked", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		markProfileUnviewable(1);

		expect(state.taps).toEqual([]);

		markProfileViewable(1);
		await vi.waitFor(() => expect(state.taps).toEqual([tap(1)]));
	});

	it("drops a tap sender marked while a reconcile fetch is in flight", async () => {
		getReceivedTapsMock.mockResolvedValueOnce({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		const gate = deferred<{ profiles: TapProfile[] }>();
		getReceivedTapsMock.mockReturnValueOnce(gate.promise);

		const reconcilePromise = reconcileHandlers[0]?.();
		markProfileUnviewable(1);
		gate.resolve({ profiles: [tap(1)] });
		await reconcilePromise;

		expect(state.taps).toEqual([]);
	});

	it("reconciles after initial load and cleans up listeners on destroy", async () => {
		getReceivedTapsMock
			.mockResolvedValueOnce({ profiles: [tap(1)] })
			.mockResolvedValueOnce({ profiles: [tap(2)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		await reconcileHandlers[0]?.();

		expect(state.taps).toEqual([tap(2)]);

		state.destroy();
		emitTap({
			type: "tap.v1.tap_sent",
			notificationId: null,
			ref: null,
			payload: {
				timestamp: 1_710_000_002_000,
				senderId: 3,
				recipientId: 99,
				tapType: 0,
				senderProfileImageHash: null,
				senderDisplayName: "After destroy",
				isMutual: false,
			},
		});

		markProfileUnviewable(2);

		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(unlistenTapMock).toHaveBeenCalledOnce());
		expect(state.taps).toEqual([tap(2)]);
	});
});

describe("TapsState unseen marker", () => {
	it("flags received taps as unseen until the list is viewed", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1), tap(2)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		expect(state.hasUnseen).toBe(true);

		state.markViewed();

		expect(state.hasUnseen).toBe(false);
	});

	it("stays cleared for a tap older than the stored marker", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const viewed = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(viewed);
		viewed.markViewed();

		const restarted = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(restarted);

		expect(restarted.hasUnseen).toBe(false);
	});

	it("keeps the marker scoped to the signed in account", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const ours = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(ours);
		ours.markViewed();

		const otherAccount = new TapsState({ ourProfileId: 7 });
		await waitForLoaded(otherAccount);

		expect(otherAccount.hasUnseen).toBe(true);
	});

	it("raises the marker for a live tap whose timestamp is not the newest", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);
		state.markViewed();

		emitTap({
			type: "tap.v1.tap_sent",
			notificationId: null,
			ref: null,
			payload: {
				timestamp: 1_710_000_000,
				senderId: 5,
				recipientId: 99,
				tapType: 0,
				senderProfileImageHash: null,
				senderDisplayName: "Profile 5",
				isMutual: false,
			},
		});

		expect(state.taps.map((entry) => entry.profileId)).toEqual([5, 1]);
		expect(state.hasUnseen).toBe(true);
	});

	it("dismisses a live tap that lands while the list is open", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);

		const stop = $effect.root(() => {
			$effect(() => {
				if (state.hasUnseen) state.markViewed();
			});
		});
		flushSync();

		expect(state.hasUnseen).toBe(false);

		emitTap(tapEvent(5, 99));
		flushSync();
		stop();

		expect(state.hasUnseen).toBe(false);
	});

	it("pushes a live tap to a reactive reader without a refetch", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);
		state.markViewed();

		const seen: boolean[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				seen.push(state.hasUnseen);
			});
		});
		flushSync();

		emitTap(tapEvent(5, 99));
		flushSync();
		stop();

		expect(seen).toEqual([false, true]);
	});

	it("raises the marker again only for a newer tap addressed to us", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });
		const state = new TapsState({ ourProfileId: 99 });
		await waitForLoaded(state);
		state.markViewed();

		emitTap(tapEvent(5, 7));

		expect(state.hasUnseen).toBe(false);

		emitTap(tapEvent(5, 99));

		expect(state.hasUnseen).toBe(true);
	});
});

describe("getTapsState", () => {
	it("keeps one loaded state per account across revisits", async () => {
		getReceivedTapsMock.mockResolvedValue({ profiles: [tap(1)] });

		const state = getTapsState(99);
		await waitForLoaded(state);
		state.visibleCount = 40;

		const revisited = getTapsState(99);
		revisited.load();

		expect(revisited).toBe(state);
		expect(revisited.visibleCount).toBe(40);
		expect(getReceivedTapsMock).toHaveBeenCalledTimes(1);

		clearAccountCaches();

		expect(getTapsState(99)).not.toBe(state);
		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
	});
});
