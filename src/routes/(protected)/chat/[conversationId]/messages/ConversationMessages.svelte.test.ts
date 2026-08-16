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
	const { container } = render(ConversationMessages, {
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
		scrollDownButton: () =>
			container.querySelector('[aria-label="Scroll to newest messages"]'),
		badge: () => container.querySelector('[data-slot="badge"]'),
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
