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
const FLAGGED_TOO = "d:4";
const PLAIN_TOO = "e:5";

const refused = () => Promise.reject(new Error("refused"));

const refusedUnless =
	(accepted: string) =>
	({ conversationId }: { conversationId: string }) =>
		conversationId === accepted ? Promise.resolve() : refused();

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	vi.spyOn(console, "error").mockImplementation(() => {});
	getConversationsMock.mockResolvedValue({
		entries: [
			conversation(FLAGGED, 4000, { pinned: true, muted: true }),
			conversation(FLAGGED_TOO, 3000, { pinned: true, muted: true }),
			conversation(PLAIN, 2000),
			conversation(PLAIN_TOO, 1000),
		],
		nextPage: null,
	});
	setConversationPinnedMock.mockImplementation(refused);
	setConversationMutedMock.mockImplementation(refused);
	deleteConversationForMeMock.mockImplementation(refused);
});

async function loadedState(): Promise<ConversationsState> {
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
	});
	await settled(state);
	return state;
}

function expectOneToast(label: string) {
	expect(showErrorToastMock).toHaveBeenCalledOnce();
	expect(showErrorToastMock).toHaveBeenCalledWith({
		label,
		error: expect.any(Error),
	});
}

describe("ConversationsState failure toasts", () => {
	it.each([
		[
			"pinning",
			(state: ConversationsState) =>
				state.setPinned({ conversationIds: [PLAIN], pinned: true }),
			"Couldn’t pin conversation",
		],
		[
			"unpinning",
			(state: ConversationsState) =>
				state.setPinned({ conversationIds: [FLAGGED], pinned: false }),
			"Couldn’t unpin conversation",
		],
		[
			"muting",
			(state: ConversationsState) =>
				state.setMuted({ conversationIds: [PLAIN], muted: true }),
			"Couldn’t mute conversation",
		],
		[
			"unmuting",
			(state: ConversationsState) =>
				state.setMuted({ conversationIds: [FLAGGED], muted: false }),
			"Couldn’t unmute conversation",
		],
		[
			"deleting",
			(state: ConversationsState) => state.deleteConversations([FLAGGED]),
			"Couldn’t delete conversation",
		],
	])(
		"names the action when %s one conversation fails",
		async (_action, act, label) => {
			const state = await loadedState();

			await act(state);

			expectOneToast(label);
		},
	);

	it.each([
		[
			"pinning",
			(state: ConversationsState) =>
				state.setPinned({
					conversationIds: [PLAIN, PLAIN_TOO],
					pinned: true,
				}),
			"Couldn’t pin 2 conversations",
		],
		[
			"unpinning",
			(state: ConversationsState) =>
				state.setPinned({
					conversationIds: [FLAGGED, FLAGGED_TOO],
					pinned: false,
				}),
			"Couldn’t unpin 2 conversations",
		],
		[
			"muting",
			(state: ConversationsState) =>
				state.setMuted({
					conversationIds: [PLAIN, PLAIN_TOO],
					muted: true,
				}),
			"Couldn’t mute 2 conversations",
		],
		[
			"unmuting",
			(state: ConversationsState) =>
				state.setMuted({
					conversationIds: [FLAGGED, FLAGGED_TOO],
					muted: false,
				}),
			"Couldn’t unmute 2 conversations",
		],
		[
			"deleting",
			(state: ConversationsState) =>
				state.deleteConversations([FLAGGED, PLAIN]),
			"Couldn’t delete 2 conversations",
		],
	])(
		"counts the conversations when %s several fails",
		async (_action, act, label) => {
			const state = await loadedState();

			await act(state);

			expectOneToast(label);
		},
	);

	it("names one conversation when only one of the selection fails", async () => {
		setConversationMutedMock.mockImplementation(refusedUnless(PLAIN));
		const state = await loadedState();

		await state.setMuted({
			conversationIds: [PLAIN, PLAIN_TOO],
			muted: true,
		});

		expectOneToast("Couldn’t mute conversation");
	});

	it("counts only the selected conversations that failed", async () => {
		deleteConversationForMeMock.mockImplementation(refusedUnless(PLAIN));
		const state = await loadedState();

		await state.deleteConversations([
			FLAGGED,
			FLAGGED_TOO,
			PLAIN,
			PLAIN_TOO,
		]);

		expectOneToast("Couldn’t delete 3 conversations");
	});

	it("names a failed sync of a conversation missing from the list", async () => {
		const state = await loadedState();
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));

		await expect(state.ensureLoaded("c:3")).resolves.toBe(false);

		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "Couldn’t update the inbox",
			error: expect.any(Error),
		});
	});
});
