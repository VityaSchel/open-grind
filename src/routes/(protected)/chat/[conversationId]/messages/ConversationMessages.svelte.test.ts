// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OptimisticMessage } from "../merge-messages";
import ConversationMessages from "./ConversationMessages.svelte";

interface FakeConversationState {
	conversationId: string;
	ourProfileId: number;
	messages: OptimisticMessage[];
	loading: boolean;
	refreshing: boolean;
	error: Error | null;
}

const box = vi.hoisted<{ current: unknown }>(() => ({ current: null }));

vi.mock("../conversation-state.svelte", () => ({
	getConversationState: () => () => box.current,
}));

vi.mock("./MessagesList.svelte", () => ({ default: () => ({}) }));
vi.mock("./MessagesListSkeleton.svelte", () => ({ default: () => ({}) }));
vi.mock("./ConversationError.svelte", () => ({ default: () => ({}) }));
vi.mock("./ConversationPaginationSentinel.svelte", () => ({
	default: () => ({}),
}));
vi.mock("$lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => ({ scrollToRest: () => {} }),
}));

const OUR_PROFILE_ID = 1;
const PEER_PROFILE_ID = 7;

let nextMessageNumber = 0;

function message({
	senderId = PEER_PROFILE_ID,
	timestamp,
}: {
	senderId?: number;
	timestamp: number;
}): OptimisticMessage {
	return {
		messageId: `m${nextMessageNumber++}`,
		conversationId: "a:1",
		senderId,
		timestamp,
		type: "Text",
		body: { text: "hi" },
		reactions: [],
		unsent: false,
		status: "sent",
	} as unknown as OptimisticMessage;
}

async function mountConversation({
	messages,
}: {
	messages: OptimisticMessage[];
}) {
	const state: FakeConversationState = $state({
		conversationId: "a:1",
		ourProfileId: OUR_PROFILE_ID,
		messages,
		loading: false,
		refreshing: false,
		error: null,
	});
	box.current = state;
	const { container, rerender } = render(ConversationMessages, {
		props: { composerHeight: 0 },
	});
	const scroller = container.querySelector(
		'[data-slot="messages-scroller"]',
	) as HTMLElement;
	// the initial scroll-to-rest resolves a tick after load
	await tick();
	await tick();
	return {
		state,
		container,
		scroller,
		async scrollAwayFromFloor() {
			Object.defineProperty(scroller, "scrollHeight", {
				value: 1000,
				configurable: true,
			});
			Object.defineProperty(scroller, "clientHeight", {
				value: 400,
				configurable: true,
			});
			scroller.scrollTop = 100;
			scroller.dispatchEvent(new Event("scroll"));
			await tick();
		},
		async scrollToFloor() {
			scroller.scrollTop = 600;
			scroller.dispatchEvent(new Event("scroll"));
			scroller.dispatchEvent(new Event("scrollend"));
			await tick();
		},
		async resizeComposer(composerHeight: number) {
			await rerender({ composerHeight });
			await tick();
		},
		scrollDownButton: () =>
			container.querySelector('[aria-label="Scroll to newest messages"]'),
		badge: () => container.querySelector('[data-slot="badge"]'),
	};
}

type Layout = { scrollHeight: number; clientHeight: number; trueFloor: number };

function layOutLikeAnEngine(scroller: HTMLElement) {
	const layout: Layout = { scrollHeight: 0, clientHeight: 0, trueFloor: 0 };
	let scrollTop = 0;
	Object.defineProperties(scroller, {
		scrollHeight: { get: () => layout.scrollHeight, configurable: true },
		clientHeight: { get: () => layout.clientHeight, configurable: true },
		scrollTop: {
			get: () => scrollTop,
			set: (top: number) => {
				scrollTop = Math.min(Math.max(0, top), layout.trueFloor);
			},
			configurable: true,
		},
	});
	return (next: Layout) => {
		Object.assign(layout, next);
		scrollTop = Math.min(scrollTop, layout.trueFloor);
	};
}

describe("the new-messages badge", () => {
	afterEach(cleanup);

	it("stays empty when a merge re-times messages that were already seen", async () => {
		const conversation = await mountConversation({
			messages: [
				message({ timestamp: 2000 }),
				message({ timestamp: 1000 }),
			],
		});

		await conversation.scrollAwayFromFloor();
		expect(conversation.scrollDownButton()).not.toBeNull();
		expect(conversation.badge()).toBeNull();

		const [newest, ...rest] = conversation.state.messages;
		conversation.state.messages = [
			{ ...newest, timestamp: 9000 } as OptimisticMessage,
			...rest,
		];
		await tick();

		expect(conversation.badge()).toBeNull();
	});

	it("counts only the peer's genuinely new messages", async () => {
		const conversation = await mountConversation({
			messages: [message({ timestamp: 2000 })],
		});

		await conversation.scrollAwayFromFloor();
		conversation.state.messages = [
			message({ timestamp: 3000 }),
			...conversation.state.messages,
		];
		await tick();
		expect(conversation.badge()?.textContent?.trim()).toBe("1");

		conversation.state.messages = [
			message({ senderId: OUR_PROFILE_ID, timestamp: 4000 }),
			...conversation.state.messages,
		];
		await tick();
		expect(conversation.badge()?.textContent?.trim()).toBe("1");
	});

	it("keeps paginated-in history out of the count", async () => {
		const conversation = await mountConversation({
			messages: [message({ timestamp: 5000 })],
		});

		await conversation.scrollAwayFromFloor();
		conversation.state.messages = [
			...conversation.state.messages,
			message({ timestamp: 400 }),
			message({ timestamp: 300 }),
		];
		await tick();

		expect(conversation.scrollDownButton()).not.toBeNull();
		expect(conversation.badge()).toBeNull();
	});

	it("clears at the floor and stays clear on the next scroll away", async () => {
		const conversation = await mountConversation({
			messages: [message({ timestamp: 2000 })],
		});

		await conversation.scrollAwayFromFloor();
		conversation.state.messages = [
			message({ timestamp: 3000 }),
			...conversation.state.messages,
		];
		await tick();
		expect(conversation.badge()?.textContent?.trim()).toBe("1");

		await conversation.scrollToFloor();
		await conversation.scrollAwayFromFloor();

		expect(conversation.scrollDownButton()).not.toBeNull();
		expect(conversation.badge()).toBeNull();
	});

	it("shows nothing when a conversation switch is followed straight by a scroll up", async () => {
		const conversation = await mountConversation({
			messages: [
				message({ timestamp: 2000 }),
				message({ timestamp: 1000 }),
			],
		});

		conversation.state.conversationId = "b:2";
		conversation.state.messages = [
			message({ timestamp: 8000 }),
			message({ timestamp: 7000 }),
			message({ timestamp: 6000 }),
		];
		await tick();
		await tick();

		await conversation.scrollAwayFromFloor();

		expect(conversation.scrollDownButton()).not.toBeNull();
		expect(conversation.badge()).toBeNull();
	});
});

describe("holding the floor through a composer resize", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	async function readerRestsAt({
		scrollTop,
		trueFloor,
	}: {
		scrollTop: number;
		trueFloor: number;
	}) {
		const conversation = await mountConversation({
			messages: [message({ timestamp: 2000 })],
		});
		const layOut = layOutLikeAnEngine(conversation.scroller);
		layOut({ scrollHeight: 1000, clientHeight: 400, trueFloor });
		conversation.scroller.scrollTop = scrollTop;
		conversation.scroller.dispatchEvent(new Event("scroll"));
		conversation.scroller.dispatchEvent(new Event("scrollend"));
		await tick();
		return { conversation, layOut };
	}

	it("puts a reader resting within rounding of the floor back on the true floor", async () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const { conversation, layOut } = await readerRestsAt({
			scrollTop: 599,
			trueFloor: 599,
		});

		layOut({ scrollHeight: 1000, clientHeight: 380, trueFloor: 619.6 });
		await conversation.resizeComposer(20);

		expect(conversation.scroller.scrollTop).toBe(619.6);
	});

	it("keeps a reader resting a few pixels above the floor that far above it", async () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const { conversation, layOut } = await readerRestsAt({
			scrollTop: 594,
			trueFloor: 599.6,
		});

		layOut({ scrollHeight: 1000, clientHeight: 380, trueFloor: 619.6 });
		await conversation.resizeComposer(20);

		expect(conversation.scroller.scrollTop).toBe(614);
	});
});
