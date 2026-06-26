import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getReceivedTapsMock,
	reconcileHandlers,
	showErrorToastMock,
	subscriptions,
	tapHandlers,
	unsubscribeReconcileMock,
	unlistenTapMock,
} = vi.hoisted(() => ({
	getReceivedTapsMock: vi.fn(),
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

vi.mock("$lib/api/error", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/taps", () => ({
	getReceivedTaps: getReceivedTapsMock,
}));
vi.mock("$lib/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return unsubscribeReconcileMock;
		},
	},
}));
import type { TapProfile } from "$lib/model/interest/tap-profile";
import { TapsState } from "./taps-state.svelte";

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

beforeEach(() => {
	getReceivedTapsMock.mockReset();
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

		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(unlistenTapMock).toHaveBeenCalledOnce());
		expect(state.taps).toEqual([tap(2)]);
	});
});
