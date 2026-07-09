import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getViewsMock,
	reconcileHandlers,
	showErrorToastMock,
	subscriptions,
	unlistenViewMock,
	unsubscribeReconcileMock,
	viewHandlers,
} = vi.hoisted(() => ({
	getViewsMock: vi.fn(),
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	showErrorToastMock: vi.fn(),
	subscriptions: [] as {
		eventType: string;
		schema: { parse(payload: unknown): unknown };
	}[],
	unlistenViewMock: vi.fn(),
	unsubscribeReconcileMock: vi.fn(),
	viewHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$lib/api/error", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/views", () => ({ getViews: getViewsMock }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return unsubscribeReconcileMock;
		},
	},
}));
import type { ViewerProfile, ViewPreview } from "$lib/model/interest/views";
import { ViewsState } from "./views-state.svelte";

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

beforeEach(() => {
	getViewsMock.mockReset();
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
			profiles: Array.from({ length: 24 }, (_, index) => profile(index + 1)),
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

	it("cleans up subscriptions on destroy", async () => {
		getViewsMock.mockResolvedValue({ profiles: [profile(1)], previews: [] });
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

		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(unlistenViewMock).toHaveBeenCalledOnce());
		expect(state.views).toHaveLength(1);
	});
});
