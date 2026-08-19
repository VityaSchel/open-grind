import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	currentPage,
	singleColumn,
	reconcileHandlers,
	conversationDeleteHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
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
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			if (eventType === "chat.v1.conversation.delete")
				conversationDeleteHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	deferred,
	entryFor,
	microtasks,
	OUR_ID,
	settled,
} from "./conversations-test-helpers";

type InboxPage = {
	entries: ReturnType<typeof conversation>[];
	nextPage: number | null;
};

const STARRED_PEER = 20;
const PLAIN_PEER = 30;

function participant(profileId: number) {
	return {
		profileId,
		primaryMediaHash: null,
		lastOnline: null,
		onlineUntil: null,
		distanceMetres: null,
		position: null,
		isInAList: false,
		hasDatingPotential: false,
	};
}

async function loadedInbox() {
	getConversationsMock.mockResolvedValue({
		entries: [
			conversation("a:1", 2000, {
				favorite: true,
				participants: [participant(STARRED_PEER)],
			}),
			conversation("b:2", 1000, {
				participants: [participant(PLAIN_PEER)],
			}),
		],
		nextPage: null,
	});
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
	});
	await settled(state);
	return state;
}

const loaded = (state: ConversationsState) =>
	state.entries.map((entry) => entry.data.conversationId);

const FAVORITES_BODY = {
	unreadOnly: false,
	chemistryOnly: false,
	favoritesOnly: true,
	rightNowOnly: false,
	onlineNowOnly: false,
	distanceMeters: null,
	positions: [],
};

function serveFilterAwareInbox() {
	getConversationsMock.mockImplementation(
		({
			filters = null,
		}: {
			page?: number;
			filters?: { favoritesOnly: boolean } | null;
		} = {}) => {
			const all = [
				conversation("a:1", 2000, {
					favorite: true,
					participants: [participant(STARRED_PEER)],
				}),
				conversation("b:2", 1000, {
					unreadCount: 1,
					participants: [participant(PLAIN_PEER)],
				}),
			];
			return Promise.resolve({
				entries: filters?.favoritesOnly
					? all.filter((entry) => entry.data.favorite)
					: all,
				nextPage: null,
			});
		},
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	reconcileHandlers.length = 0;
	conversationDeleteHandlers.length = 0;
});

describe("inbox favorites filter", () => {
	it("refetches the server-filtered list when the filter toggles", async () => {
		serveFilterAwareInbox();
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		expect(loaded(state)).toEqual(["a:1", "b:2"]);

		state.setFilters(["favorites"]);
		await settled(state);

		expect(getConversationsMock).toHaveBeenLastCalledWith({
			page: 1,
			filters: FAVORITES_BODY,
		});
		expect(loaded(state)).toEqual(["a:1"]);

		state.setFilters([]);
		await settled(state);

		expect(getConversationsMock).toHaveBeenLastCalledWith({
			page: 1,
			filters: null,
		});
		expect(loaded(state)).toEqual(["a:1", "b:2"]);
	});

	it("keeps a non-matching conversation out of a filtered list", async () => {
		serveFilterAwareInbox();
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		state.setFilters(["favorites"]);
		await settled(state);
		expect(loaded(state)).toEqual(["a:1"]);
		getConversationsMock.mockClear();

		await state.ensureLoaded("b:2");

		expect(getConversationsMock).toHaveBeenCalledWith({
			page: 1,
			filters: FAVORITES_BODY,
		});
		expect(loaded(state)).toEqual(["a:1"]);
	});

	it("updates a row's star without changing list membership", async () => {
		const state = await loadedInbox();

		mergeProfileEditIntoCaches({
			cacheProfileId: PLAIN_PEER,
			patch: { isFavorite: true },
		});

		expect(entryFor(state, "b:2").data.favorite).toBe(true);
		expect(loaded(state)).toEqual(["a:1", "b:2"]);
	});

	it("keeps an unstarred conversation in place while the filter is on", async () => {
		serveFilterAwareInbox();
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		state.setFilters(["favorites"]);
		await settled(state);

		mergeProfileEditIntoCaches({
			cacheProfileId: STARRED_PEER,
			patch: { isFavorite: false },
		});

		expect(entryFor(state, "a:1").data.favorite).toBe(false);
		expect(loaded(state)).toEqual(["a:1"]);
	});

	it("ignores profile edits that do not touch the favorite flag", async () => {
		const state = await loadedInbox();

		mergeProfileEditIntoCaches({
			cacheProfileId: STARRED_PEER,
			patch: { displayName: "renamed" },
		});

		expect(entryFor(state, "a:1").data.favorite).toBe(true);
	});

	it("prunes a conversation a filtered reconcile no longer returns", async () => {
		serveFilterAwareInbox();
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		state.setFilters(["favorites"]);
		await settled(state);
		expect(loaded(state)).toEqual(["a:1"]);

		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		await reconcileHandlers[0]?.();

		expect(loaded(state)).toEqual([]);
	});

	it("ignores a superseded load's failure after a filter toggle", async () => {
		const first = deferred<InboxPage>();
		getConversationsMock.mockReturnValueOnce(first.promise);
		getConversationsMock.mockResolvedValue({
			entries: [
				conversation("a:1", 2000, {
					favorite: true,
					participants: [participant(STARRED_PEER)],
				}),
			],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		state.setFilters(["favorites"]);
		await settled(state);
		expect(loaded(state)).toEqual(["a:1"]);

		first.reject(new Error("network down"));
		await microtasks();

		expect(state.error).toBeNull();
		expect(loaded(state)).toEqual(["a:1"]);
	});

	it("keeps loading until the current filter's load settles", async () => {
		const first = deferred<InboxPage>();
		const second = deferred<InboxPage>();
		getConversationsMock
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		state.setFilters(["favorites"]);

		first.resolve({
			entries: [
				conversation("b:2", 1000, {
					participants: [participant(PLAIN_PEER)],
				}),
			],
			nextPage: null,
		});
		await microtasks();

		expect(state.loading).toBe(true);
		expect(loaded(state)).toEqual([]);

		second.resolve({
			entries: [
				conversation("a:1", 2000, {
					favorite: true,
					participants: [participant(STARRED_PEER)],
				}),
			],
			nextPage: null,
		});
		await settled(state);
		expect(loaded(state)).toEqual(["a:1"]);
	});

	it("pages the filtered set with the filter body", async () => {
		getConversationsMock.mockResolvedValue({
			entries: [
				conversation("a:1", 2000, {
					favorite: true,
					participants: [participant(STARRED_PEER)],
				}),
			],
			nextPage: 2,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		state.setFilters(["favorites"]);
		await settled(state);
		expect(state.nextPage).toBe(2);

		await state.paging.run();

		expect(getConversationsMock).toHaveBeenLastCalledWith({
			page: 2,
			filters: FAVORITES_BODY,
		});
	});

	it("marks the inbox viewed at the newest loaded activity", async () => {
		const state = await loadedInbox();

		state.noteListViewed();

		expect(state.inboxViewed.lastViewedAt).toBe(2000);
	});

	it("holds the mark when the list shrinks, and advances on new activity", async () => {
		const state = await loadedInbox();
		state.noteListViewed();
		expect(state.inboxViewed.lastViewedAt).toBe(2000);

		state.remove("a:1");
		state.noteListViewed();
		expect(state.inboxViewed.lastViewedAt).toBe(2000);

		entryFor(state, "b:2").data.lastActivityTimestamp = 2500;
		state.noteListViewed();

		expect(state.inboxViewed.lastViewedAt).toBe(2500);
	});

	it("stops following profile edits once destroyed", async () => {
		const state = await loadedInbox();
		await state.destroy();

		mergeProfileEditIntoCaches({
			cacheProfileId: STARRED_PEER,
			patch: { isFavorite: false },
		});

		expect(entryFor(state, "a:1").data.favorite).toBe(true);
	});
});
