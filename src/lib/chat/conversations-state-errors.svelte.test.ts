import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	setConversationPinnedMock,
	setConversationMutedMock,
	deleteConversationForMeMock,
	showErrorToastMock,
	currentPage,
	singleColumn,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	setConversationPinnedMock: vi.fn(),
	setConversationMutedMock: vi.fn(),
	deleteConversationForMeMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: deleteConversationForMeMock,
	setConversationPinned: setConversationPinnedMock,
	setConversationMuted: setConversationMutedMock,
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({ below: () => singleColumn }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

import { ConversationsState } from "./conversations-state.svelte";
import { conversation, OUR_ID, settled } from "./conversations-test-helpers";

const FLAGGED = "a:1";
const PLAIN = "b:2";

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	vi.spyOn(console, "error").mockImplementation(() => {});
	getConversationsMock.mockResolvedValue({
		entries: [
			conversation(FLAGGED, 2000, { pinned: true, muted: true }),
			conversation(PLAIN, 1000),
		],
		nextPage: null,
	});
	const refused = () => Promise.reject(new Error("refused"));
	setConversationPinnedMock.mockImplementation(refused);
	setConversationMutedMock.mockImplementation(refused);
	deleteConversationForMeMock.mockImplementation(refused);
});

describe("ConversationsState failure toasts", () => {
	it.each([
		[
			"pinning",
			(state: ConversationsState) =>
				state.setPinned({ conversationIds: [PLAIN], pinned: true }),
			"Failed to pin conversation",
		],
		[
			"unpinning",
			(state: ConversationsState) =>
				state.setPinned({ conversationIds: [FLAGGED], pinned: false }),
			"Failed to unpin conversation",
		],
		[
			"muting",
			(state: ConversationsState) =>
				state.setMuted({ conversationIds: [PLAIN], muted: true }),
			"Failed to mute conversation",
		],
		[
			"unmuting",
			(state: ConversationsState) =>
				state.setMuted({ conversationIds: [FLAGGED], muted: false }),
			"Failed to unmute conversation",
		],
		[
			"deleting",
			(state: ConversationsState) =>
				state.deleteConversations([FLAGGED, PLAIN]),
			"Failed to delete conversation",
		],
	])("names the action when %s fails", async (_action, act, label) => {
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);

		await act(state);

		expect(showErrorToastMock).toHaveBeenCalledOnce();
		expect(showErrorToastMock).toHaveBeenCalledWith({
			label,
			error: expect.any(Error),
		});
	});

	it("names a failed sync of a conversation missing from the list", async () => {
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));

		await expect(state.ensureLoaded("c:3")).resolves.toBe(false);

		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "Failed to sync conversation into sidebar",
			error: expect.any(Error),
		});
	});
});
