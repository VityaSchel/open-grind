// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";

const { conversations } = vi.hoisted(() => ({
	conversations: { drafts: null as Drafts | null },
}));

vi.mock("$app/state", () => ({ page: { params: {} } }));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));
vi.mock("$lib/haptics", () => ({ playHaptic: vi.fn() }));

import type { Conversation as ConversationType } from "$lib/model/messaging/conversations";
import LazyConversation from "./LazyConversation.svelte";
import { MountQueue, type MountTicket } from "./mount-queue";

const PLACEHOLDER = ".bg-muted\\/30";

class FakeIntersectionObserver {
	static all: FakeIntersectionObserver[] = [];
	#callback: IntersectionObserverCallback;
	readonly rootMargin: string | undefined;
	node: Element | null = null;

	constructor(
		callback: IntersectionObserverCallback,
		options?: IntersectionObserverInit,
	) {
		this.#callback = callback;
		this.rootMargin = options?.rootMargin;
		FakeIntersectionObserver.all.push(this);
	}

	static enter({ node, onScreen }: { node: Element; onScreen: boolean }) {
		for (const observer of FakeIntersectionObserver.all) {
			if (observer.node !== node) continue;
			if (onScreen || observer.rootMargin !== undefined) {
				observer.enter(node);
			}
		}
	}

	enter(node: Element) {
		this.#callback(
			[
				{
					isIntersecting: true,
					target: node,
				} as unknown as IntersectionObserverEntry,
			],
			this as unknown as IntersectionObserver,
		);
	}

	observe(node: Element) {
		this.node = node;
	}

	unobserve() {}
	disconnect() {}
}

function conversation(conversationId: string): ConversationType {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId,
			name: "Someone",
			participants: [],
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

function frameQueue() {
	let frames: (() => void)[] = [];
	let clock = 0;
	const queue = new MountQueue({
		requestFrame: (callback) => frames.push(callback),
		cancelFrame: () => {},
		now: () => (clock += 5),
	});
	function runFrame() {
		const due = frames;
		frames = [];
		for (const callback of due) callback();
	}
	return { queue, runFrame };
}

function stubQueue() {
	const ticket: MountTicket = { promote: vi.fn(), cancel: vi.fn() };
	const add = vi.fn(() => ticket);
	const queue = { add } as unknown as MountQueue;
	return { queue, add, ticket };
}

function renderRow({
	conversationId = "a:1",
	eager,
	queue,
}: {
	conversationId?: string;
	eager: boolean;
	queue: MountQueue;
}) {
	return render(LazyConversation, {
		props: {
			conversation: conversation(conversationId),
			eager,
			queue,
			onEnterSelection: () => {},
		},
	});
}

const rowLink = ({
	container,
	conversationId = "a:1",
}: {
	container: HTMLElement;
	conversationId?: string;
}) => container.querySelector(`a[href="/chat/${conversationId}"]`);

beforeEach(() => {
	conversations.drafts = new Drafts();
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
	cleanup();
	FakeIntersectionObserver.all = [];
	vi.unstubAllGlobals();
});

describe("LazyConversation", () => {
	it("renders an eager row straight away", () => {
		const { queue, add } = stubQueue();
		const { container } = renderRow({ eager: true, queue });

		expect(rowLink({ container })).not.toBeNull();
		expect(container.querySelector(PLACEHOLDER)).toBeNull();
		expect(add).not.toHaveBeenCalled();
	});

	it("holds a placeholder until the queue reaches the row", () => {
		const { queue, runFrame } = frameQueue();
		const { container } = renderRow({ eager: false, queue });
		expect(container.querySelector(PLACEHOLDER)).not.toBeNull();
		expect(rowLink({ container })).toBeNull();

		runFrame();

		expect(rowLink({ container })).not.toBeNull();
		expect(container.querySelector(PLACEHOLDER)).toBeNull();
	});

	it("lets a row scrolled into view jump ahead of offscreen rows", () => {
		const { queue, runFrame } = frameQueue();
		const above = renderRow({ conversationId: "a:1", eager: false, queue });
		const below = renderRow({ conversationId: "b:2", eager: false, queue });

		FakeIntersectionObserver.enter({
			node: below.container.querySelector(PLACEHOLDER)!,
			onScreen: false,
		});
		runFrame();

		expect(
			rowLink({ container: below.container, conversationId: "b:2" }),
		).not.toBeNull();
		expect(rowLink({ container: above.container })).toBeNull();
	});

	it("mounts a row on screen before a row only near the screen", () => {
		const { queue, runFrame } = frameQueue();
		const near = renderRow({ conversationId: "a:1", eager: false, queue });
		const onScreen = renderRow({
			conversationId: "b:2",
			eager: false,
			queue,
		});

		FakeIntersectionObserver.enter({
			node: near.container.querySelector(PLACEHOLDER)!,
			onScreen: false,
		});
		FakeIntersectionObserver.enter({
			node: onScreen.container.querySelector(PLACEHOLDER)!,
			onScreen: true,
		});
		runFrame();

		expect(
			rowLink({ container: onScreen.container, conversationId: "b:2" }),
		).not.toBeNull();
		expect(rowLink({ container: near.container })).toBeNull();
	});

	it("keeps its mounted row when it moves past the eager rows", async () => {
		const { queue } = stubQueue();
		const { container, rerender } = renderRow({ eager: true, queue });
		const before = rowLink({ container });

		await rerender({ eager: false });

		expect(rowLink({ container })).toBe(before);
		expect(container.querySelector(PLACEHOLDER)).toBeNull();
	});

	it("leaves the queue when it goes away before mounting", () => {
		const { queue, ticket } = stubQueue();
		const { unmount } = renderRow({ eager: false, queue });

		unmount();

		expect(ticket.cancel).toHaveBeenCalledOnce();
	});
});
