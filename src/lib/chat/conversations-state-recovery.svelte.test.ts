import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

const {
	getConversationsMock,
	showErrorToastMock,
	onIncomingMessage,
	onFetchedReads,
	messageSentHandlers,
	currentPage,
	singleColumn,
	reconcileHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	onIncomingMessage: vi.fn(),
	onFetchedReads: vi.fn(),
	messageSentHandlers: [] as ((event: unknown) => void)[],
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
	reconcileHandlers: [] as (() => void | Promise<void>)[],
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: vi.fn(() => Promise.resolve()),
	setConversationPinned: vi.fn(() => Promise.resolve()),
	setConversationMuted: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({ below: () => singleColumn }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return vi.fn();
		},
	},
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(
			eventType: string,
			_schema: unknown,
			handler: (event: unknown) => void,
		) {
			if (eventType === "chat.v1.message_sent")
				messageSentHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	deferred,
	entryFor,
	fromPeer,
	microtasks,
	OUR_ID,
	settled,
} from "./conversations-test-helpers";

function page(entries: ReturnType<typeof conversation>[]) {
	return { entries, nextPage: null };
}

async function inboxWith(unreadCount = 0) {
	getConversationsMock.mockResolvedValue(
		page([conversation("a:1", 1000, { unreadCount })]),
	);
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage,
		onFetchedReads,
	});
	onTestFinished(() => state.destroy());
	await settled(state);
	getConversationsMock.mockClear();
	onFetchedReads.mockClear();
	return state;
}

function receive(conversationId = "a:1") {
	messageSentHandlers[0]?.({ payload: fromPeer(conversationId, 3000) });
}

beforeEach(() => {
	vi.clearAllMocks();
	getConversationsMock.mockReset();
	localStorage.clear();
	reconcileHandlers.length = 0;
	messageSentHandlers.length = 0;
});

describe.each(["refresh", "ensureLoaded"] as const)(
	"ConversationsState delayed %s",
	(method) => {
		function fetch(state: ConversationsState) {
			return method === "refresh"
				? state.refresh()
				: state.ensureLoaded("missing:3");
		}

		it.each([
			{ initial: 0, snapshot: 5, actual: 6 },
			{ initial: 5, snapshot: 0, actual: 1 },
		])(
			"keeps the live preview and recovers unread $actual after snapshot unread $snapshot",
			async ({ initial, snapshot, actual }) => {
				const state = await inboxWith(initial);
				const stale = deferred<ReturnType<typeof page>>();
				const fresh = deferred<ReturnType<typeof page>>();
				getConversationsMock
					.mockReturnValueOnce(stale.promise)
					.mockReturnValueOnce(fresh.promise);
				const pending = fetch(state);
				await vi.waitFor(() =>
					expect(getConversationsMock).toHaveBeenCalledOnce(),
				);
				receive();
				expect(entryFor(state, "a:1").data.unreadCount).toBe(
					initial + 1,
				);
				stale.resolve(
					page([
						conversation("a:1", 2000, { unreadCount: snapshot }),
					]),
				);
				await pending;
				await vi.waitFor(() =>
					expect(getConversationsMock).toHaveBeenCalledTimes(2),
				);
				expect(entryFor(state, "a:1").data).toMatchObject({
					lastActivityTimestamp: 3000,
					preview: { text: "hi" },
				});
				fresh.resolve(
					page([
						conversation("a:1", 3000, {
							unreadCount: actual,
							preview: entryFor(state, "a:1").data.preview,
						}),
					]),
				);
				await vi.waitFor(() => {
					expect(state.refreshing).toBe(false);
					expect(entryFor(state, "a:1").data.unreadCount).toBe(
						actual,
					);
				});
				expect(getConversationsMock).toHaveBeenCalledTimes(2);
			},
		);

		it.each(["success", "failure"] as const)(
			"ignores a late %s after destruction",
			async (outcome) => {
				const state = await inboxWith();
				const gate = deferred<ReturnType<typeof page>>();
				getConversationsMock.mockReturnValueOnce(gate.promise);
				const pending = fetch(state);
				await vi.waitFor(() =>
					expect(getConversationsMock).toHaveBeenCalledOnce(),
				);
				await state.destroy();
				if (outcome === "success")
					gate.resolve(page([conversation("b:2", 3000)]));
				else gate.reject(new Error("late failure"));
				await pending;
				await microtasks();
				expect(
					state.entries.map(({ data }) => data.conversationId),
				).toEqual(["a:1"]);
				expect(getConversationsMock).toHaveBeenCalledOnce();
				expect(onIncomingMessage).not.toHaveBeenCalled();
				expect(onFetchedReads).not.toHaveBeenCalled();
				expect(showErrorToastMock).not.toHaveBeenCalled();
			},
		);
	},
);

describe("ConversationsState concurrent events", () => {
	it("keeps a conversation updated after a snapshot which omitted it", async () => {
		const state = await inboxWith();
		const stale = deferred<ReturnType<typeof page>>();
		const fresh = deferred<ReturnType<typeof page>>();
		getConversationsMock
			.mockReturnValueOnce(stale.promise)
			.mockReturnValueOnce(fresh.promise);
		const pending = state.refresh();
		await vi.waitFor(() =>
			expect(getConversationsMock).toHaveBeenCalledOnce(),
		);
		receive();
		stale.resolve(page([]));
		await pending;
		await vi.waitFor(() =>
			expect(getConversationsMock).toHaveBeenCalledTimes(2),
		);
		expect(entryFor(state, "a:1").data).toMatchObject({
			lastActivityTimestamp: 3000,
			preview: { text: "hi" },
		});
		fresh.resolve(page([conversation("a:1", 3000, { unreadCount: 1 })]));
		await vi.waitFor(() => expect(state.refreshing).toBe(false));
	});

	it.each(["success", "failure"] as const)(
		"does not restart a joined missing-conversation sync after destruction and late %s",
		async (outcome) => {
			const state = await inboxWith();
			const gate = deferred<ReturnType<typeof page>>();
			getConversationsMock.mockReturnValueOnce(gate.promise);
			const pending = state.ensureLoaded("c:3");
			receive("b:2");
			expect(getConversationsMock).toHaveBeenCalledOnce();
			await state.destroy();
			getConversationsMock.mockResolvedValue(
				page([conversation("b:2", 3000)]),
			);
			if (outcome === "success")
				gate.resolve(page([conversation("a:1", 1000)]));
			else gate.reject(new Error("late failure"));
			await pending;
			await microtasks();
			expect(getConversationsMock).toHaveBeenCalledOnce();
			expect(
				state.entries.map(({ data }) => data.conversationId),
			).toEqual(["a:1"]);
			expect(onIncomingMessage).not.toHaveBeenCalled();
			expect(onFetchedReads).not.toHaveBeenCalled();
			expect(showErrorToastMock).not.toHaveBeenCalled();
		},
	);
});

describe("ConversationsState recovery after a failed first load", () => {
	it("renders the entries a later reconcile brings in, instead of the error", async () => {
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);

		expect(state.error).not.toBeNull();
		expect(state.entries).toHaveLength(0);

		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		await reconcileHandlers[0]?.();

		expect(state.entries.length).toBeGreaterThan(0);
		expect(state.error).toBeNull();
	});
});
