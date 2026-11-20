// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "#lib/chat/drafts.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { Conversation } from "#lib/model/messaging/conversations.ts";

const { fakeConversations } = vi.hoisted(() => ({
	fakeConversations: {
		entries: [] as Conversation[],
		loading: false,
		error: null,
		refreshing: false,
		refreshFailed: false,
		nextPage: null as number | null,
		filters: { filtered: false },
		paging: {},
		scrollY: 0,
		drafts: null as Drafts | null,
		noteListViewed: () => {},
	},
}));

vi.mock("$app/navigation", () => ({
	afterNavigate: () => {},
	beforeNavigate: () => {},
}));
vi.mock("$app/state", () => ({
	page: { params: {}, url: new URL("http://localhost/chat") },
}));
vi.mock("#lib/chat/conversations-context.svelte.ts", () => ({
	getConversations: () => fakeConversations,
}));
vi.mock("#lib/haptics.ts", () => ({ playHaptic: () => {} }));
vi.mock("#lib/util/deleted-pages.ts", () => ({ leaveDeletedPages: () => {} }));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
}));
vi.mock("#lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/components/shared/ScrollToTopButton.svelte", () => ({
	default: () => {},
}));
vi.mock("./filters/ConversationsFilters.svelte", () => ({ default: () => {} }));
vi.mock("./ConversationsPagingTail.svelte", () => ({ default: () => {} }));
vi.mock("./DeleteConversationsDialog.svelte", () => ({ default: () => {} }));
vi.mock("./mount-queue", () => ({
	MountQueue: class {
		add() {
			return { promote: () => {}, cancel: () => {} };
		}
		destroy() {}
	},
}));

import ConversationsList from "./ConversationsList.svelte";

const EAGER_ROWS = 10;
const LAZY_ROWS = 2;
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";
const PHONE_QUERY = "(width < 560px)";

class InertIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

function conversation(conversationId: string): Conversation {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId,
			name: `Someone ${conversationId}`,
			participants: [
				{
					profileId: 2,
					primaryMediaHash: null,
					lastOnline: null,
					onlineUntil: null,
					distanceMetres: null,
					position: null,
					isInAList: false,
					hasDatingPotential: false,
				},
			],
			lastActivityTimestamp: 1_000_000,
			unreadCount: 0,
			preview: null,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "NOT_ACTIVE",
			onlineUntil: null,
			hasUnreadThrob: false,
		},
	};
}

function useWidth(layout: "phone" | "wide") {
	vi.spyOn(window, "matchMedia").mockImplementation(
		(query) =>
			({
				matches: layout === "phone" && query === PHONE_QUERY,
				media: query,
				onchange: null,
				addEventListener: () => {},
				removeEventListener: () => {},
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			}) as MediaQueryList,
	);
}

async function mountInbox({
	count = EAGER_ROWS + LAZY_ROWS,
	nextPage = null,
}: { count?: number; nextPage?: number | null } = {}): Promise<HTMLElement> {
	fakeConversations.entries = Array.from({ length: count }, (_, at) =>
		conversation(`a:${at}`),
	);
	fakeConversations.nextPage = nextPage;
	render(ConversationsList);
	await tick();
	return screen.getByRole("grid", { name: "Inbox" });
}

function ownerOf(element: Element): Element | null {
	for (
		let node = element.parentElement;
		node !== null;
		node = node.parentElement
	)
		if (node.hasAttribute("role") || node.matches(FOCUSABLE)) return node;
	return null;
}

function ownerRoles(selector: string): (string | null)[] {
	return [...document.querySelectorAll(selector)].map(
		(element) => ownerOf(element)?.getAttribute("role") ?? null,
	);
}

beforeEach(() => {
	runningOn("linux");
	fakeConversations.drafts = new Drafts();
	vi.stubGlobal("IntersectionObserver", InertIntersectionObserver);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	resetPlatform();
});

describe.each(["wide", "phone"] as const)("the inbox grid, %s", (layout) => {
	beforeEach(() => useWidth(layout));

	it("draws one row per conversation, placeholders included", async () => {
		const grid = await mountInbox();

		expect(
			grid.querySelectorAll('[data-slot="conversation-placeholder"]'),
		).toHaveLength(LAZY_ROWS);
		expect(grid.querySelectorAll('[role="row"]')).toHaveLength(
			EAGER_ROWS + LAZY_ROWS,
		);
	});

	it("puts each cell straight in its row, with nothing focusable between", async () => {
		await mountInbox();

		const cellOwners = ownerRoles('[role="gridcell"]');
		expect(cellOwners.length).toBeGreaterThan(EAGER_ROWS + LAZY_ROWS);
		expect(new Set(cellOwners)).toEqual(new Set(["row"]));
	});

	it("puts each row straight in the grid", async () => {
		await mountInbox();

		expect(new Set(ownerRoles('[role="row"]'))).toEqual(new Set(["grid"]));
	});
});

describe("the inbox grid's row count", () => {
	it("stays open while more conversations can load", async () => {
		const grid = await mountInbox({ nextPage: 2 });

		expect(grid.getAttribute("aria-rowcount")).toBe("-1");
	});

	it("is left to the drawn rows once every conversation has loaded", async () => {
		const grid = await mountInbox({ nextPage: null });

		expect(grid.hasAttribute("aria-rowcount")).toBe(false);
	});
});
