import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationsMock, currentPage, singleColumn, reconcileHandlers } =
	vi.hoisted(() => ({
		getConversationsMock: vi.fn(),
		currentPage: { route: { id: "/(protected)/chat" } },
		singleColumn: { current: false },
		reconcileHandlers: [] as (() => void | Promise<void>)[],
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
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	entryFor,
	OUR_ID,
	partialConversation,
	settled,
} from "./conversations-test-helpers";

const GATED = "a:1";
const PLAIN = "b:2";

function serveInbox({ gated }: { gated: boolean }) {
	getConversationsMock.mockImplementation(() => {
		const pinned = conversation(GATED, 1000, { pinned: true });
		return Promise.resolve({
			entries: [
				gated ? partialConversation(pinned) : pinned,
				conversation(PLAIN, 2000),
			],
			nextPage: null,
		});
	});
}

async function loadedInbox({ gated }: { gated: boolean }) {
	serveInbox({ gated });
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
	});
	await settled(state);
	return state;
}

const loaded = (state: ConversationsState) =>
	state.entries.map((entry) => entry.data.conversationId);

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	reconcileHandlers.length = 0;
});

describe("tier-gated inbox entries", () => {
	it("lands unpinned when nothing was known about it", async () => {
		const state = await loadedInbox({ gated: true });

		expect(entryFor(state, GATED).data.pinned).toBe(false);
		expect(loaded(state)).toEqual([PLAIN, GATED]);
	});

	it("keeps the pin the unfiltered list had shown", async () => {
		const state = await loadedInbox({ gated: false });
		expect(loaded(state)).toEqual([GATED, PLAIN]);

		serveInbox({ gated: true });
		state.setFilters({ distanceMetres: 5000 });
		await settled(state);

		expect(entryFor(state, GATED).data.pinned).toBe(true);
		expect(loaded(state)).toEqual([GATED, PLAIN]);
	});

	it("lets the list unpin a gated entry", async () => {
		const state = await loadedInbox({ gated: false });
		serveInbox({ gated: true });
		state.setFilters({ distanceMetres: 5000 });
		await settled(state);

		await state.setPinned({ conversationIds: [GATED], pinned: false });

		expect(entryFor(state, GATED).data.pinned).toBe(false);
		expect(loaded(state)).toEqual([PLAIN, GATED]);
	});

	it("keeps that unpin across a later filter change", async () => {
		const state = await loadedInbox({ gated: false });
		serveInbox({ gated: true });
		state.setFilters({ distanceMetres: 5000 });
		await settled(state);
		await state.setPinned({ conversationIds: [GATED], pinned: false });

		state.setFilters({ distanceMetres: 10000 });
		await settled(state);

		expect(entryFor(state, GATED).data.pinned).toBe(false);
	});

	it("takes the server's flags back when the entry is no longer gated", async () => {
		const state = await loadedInbox({ gated: true });
		expect(entryFor(state, GATED).data.pinned).toBe(false);

		serveInbox({ gated: false });
		await state.refresh();
		await settled(state);

		expect(entryFor(state, GATED).data.pinned).toBe(true);
		expect(loaded(state)).toEqual([GATED, PLAIN]);
	});
});
