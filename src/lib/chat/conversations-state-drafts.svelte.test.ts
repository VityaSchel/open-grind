import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	deleteConversationForMeMock,
	onIncomingMessage,
	currentPage,
	singleColumn,
	reconcileHandlers,
	conversationDeleteHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	deleteConversationForMeMock: vi.fn<
		(args: { conversationId: string }) => Promise<void>
	>(() => Promise.resolve()),
	onIncomingMessage: vi.fn(),
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	conversationDeleteHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: deleteConversationForMeMock,
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
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			if (eventType === "chat.v1.conversation.delete")
				conversationDeleteHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { ConversationsState } from "./conversations-state.svelte";
import { conversation, OUR_ID, settled } from "./conversations-test-helpers";

beforeEach(() => {
	vi.clearAllMocks();
	deleteConversationForMeMock.mockImplementation(() => Promise.resolve());
	reconcileHandlers.length = 0;
	conversationDeleteHandlers.length = 0;
});

describe("ConversationsState drafts", () => {
	async function stateWithDraft(conversationId: string) {
		getConversationsMock.mockResolvedValue({
			entries: [conversation(conversationId, 1000)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
		state.drafts.save({ conversationId, text: "see you at 8" });
		return state;
	}

	it("drops the draft of a conversation the user deleted", async () => {
		const state = await stateWithDraft("a:1");

		await state.deleteConversations(["a:1"]);

		expect(state.drafts.get("a:1")).toBe("");
	});

	it("keeps the draft when the delete is rolled back", async () => {
		const state = await stateWithDraft("a:1");

		deleteConversationForMeMock.mockRejectedValueOnce(new Error("offline"));
		await state.deleteConversations(["a:1"]);

		expect(state.entries).toHaveLength(1);
		expect(state.drafts.get("a:1")).toBe("see you at 8");
	});

	it("settles each draft on its own delete when only some fail", async () => {
		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 1000), conversation("b:2", 900)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
		state.drafts.save({ conversationId: "a:1", text: "for a" });
		state.drafts.save({ conversationId: "b:2", text: "for b" });
		deleteConversationForMeMock.mockImplementation(({ conversationId }) =>
			conversationId === "b:2"
				? Promise.reject(new Error("offline"))
				: Promise.resolve(),
		);

		await state.deleteConversations(["a:1", "b:2"]);

		expect(state.entries.map((e) => e.data.conversationId)).toEqual([
			"b:2",
		]);
		expect(state.drafts.get("a:1")).toBe("");
		expect(state.drafts.get("b:2")).toBe("for b");
	});

	it("keeps a deleted conversation's draft from coming back with it", async () => {
		const state = await stateWithDraft("a:1");

		await state.deleteConversations(["a:1"]);
		state.drafts.save({ conversationId: "a:1", text: "still typing" });

		expect(state.drafts.get("a:1")).toBe("");
	});

	it("drops the draft of a conversation deleted elsewhere", async () => {
		const state = await stateWithDraft("a:1");

		conversationDeleteHandlers[0]?.({
			payload: { conversationIds: ["a:1"] },
		});

		expect(state.drafts.get("a:1")).toBe("");
	});

	it("forgets every draft once the account goes away", async () => {
		const state = await stateWithDraft("a:1");

		await state.destroy();

		expect(state.drafts.get("a:1")).toBe("");
	});
});
