import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationMock } = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

import { Drafts } from "$lib/chat/drafts.svelte";
import { ConversationState } from "./conversation-state.svelte";

const CONVERSATION_ID = "1:2";
const OUR_ID = 1;

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: 2,
	showDistance: false,
};

const message = (messageId: string, timestamp: number) => ({
	messageId,
	conversationId: CONVERSATION_ID,
	senderId: OUR_ID,
	timestamp,
	unsent: false,
	reactions: [],
	type: "Text" as const,
	body: { text: messageId },
});

const olderPage = {
	messages: [message("m0", 500)],
	profile,
	pageKey: null,
	lastReadTimestamp: null,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

async function withOlderPage() {
	getConversationMock.mockResolvedValue({
		messages: [message("m2", 2000), message("m1", 1000)],
		profile,
		pageKey: "page-2",
		lastReadTimestamp: null,
	});
	const state = new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		conversations: {
			setActive: vi.fn(),
			clearActive: vi.fn(),
			getCachedConversation: vi.fn(() => undefined),
			setCachedConversation: vi.fn(),
			updatePreview: vi.fn(),
			markRead: vi.fn(),
			ensureLoaded: vi.fn(),
			remove: vi.fn(() => ({ revert: vi.fn() })),
			drafts: new Drafts(),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
	});
	await flush();
	getConversationMock.mockResolvedValue(olderPage);
	return state;
}

const snapshot = (state: ConversationState) => ({
	messageIds: state.messages.map((m) => m.messageId),
	pageKey: state.pageKey,
	loadingMore: state.loadingMore,
});

describe("ConversationState paging", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lands the page and clears loading only inside the commit", async () => {
		const state = await withOlderPage();
		const snapshots: ReturnType<typeof snapshot>[] = [];
		const commit = vi.fn((apply: () => void) => {
			snapshots.push(snapshot(state));
			apply();
			snapshots.push(snapshot(state));
		});

		await state.loadMore({ commit });

		expect(commit).toHaveBeenCalledTimes(1);
		expect(snapshots).toEqual([
			{ messageIds: ["m2", "m1"], pageKey: "page-2", loadingMore: true },
			{
				messageIds: ["m2", "m1", "m0"],
				pageKey: null,
				loadingMore: false,
			},
		]);
	});

	it("lands the page without a commit", async () => {
		const state = await withOlderPage();

		await state.loadMore();

		expect(snapshot(state)).toEqual({
			messageIds: ["m2", "m1", "m0"],
			pageKey: null,
			loadingMore: false,
		});
	});

	it("skips the commit when the conversation closes mid-fetch", async () => {
		const state = await withOlderPage();
		const page = deferred<typeof olderPage>();
		getConversationMock.mockReturnValue(page.promise);
		const commit = vi.fn();

		const loading = state.loadMore({ commit });
		state.destroy();
		page.resolve(olderPage);
		await loading;

		expect(commit).not.toHaveBeenCalled();
		expect(state.pageKey).toBe("page-2");
	});
});
