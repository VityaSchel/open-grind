import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	showErrorToastMock,
	onIncomingMessage,
	currentPage,
	singleColumn,
	reconcileHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	onIncomingMessage: vi.fn(),
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
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

import { ConversationsState } from "./conversations-state.svelte";
import { conversation, OUR_ID, settled } from "./conversations-test-helpers";

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	reconcileHandlers.length = 0;
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
