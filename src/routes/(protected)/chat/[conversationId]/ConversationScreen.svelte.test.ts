// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { conversation } = vi.hoisted(() => ({
	conversation: { profile: null as { name: string } | null },
}));

vi.mock("#lib/chat/conversations-context.svelte.ts", () => ({
	getConversations: () => ({}),
}));
vi.mock("./conversation-state.svelte", () => ({
	ConversationState: class {
		readonly conversationId: string;
		readonly ourProfileId: number;
		readonly profile = conversation.profile;
		readonly loading = false;
		readonly error = null;
		readonly replyTo = null;
		readonly destroyed = false;

		constructor({
			conversationId,
			ourProfileId,
		}: {
			conversationId: string;
			ourProfileId: number;
		}) {
			this.conversationId = conversationId;
			this.ourProfileId = ourProfileId;
		}

		destroy() {}
	},
	setConversationState: () => {},
}));
vi.mock("./conversation-nav-bar/ConversationNavBar.svelte", () => ({
	default: () => {},
}));
vi.mock("./messages/ConversationMessages.svelte", () => ({
	default: () => {},
}));
vi.mock("./message-composer/MessageComposer.svelte", () => ({
	default: () => {},
}));

import ConversationScreen from "./ConversationScreen.svelte";

function openConversation({ leaving = false }: { leaving?: boolean } = {}) {
	render(ConversationScreen, {
		props: { conversationId: "1:2", ourProfileId: 1, leaving },
	});
}

beforeEach(() => {
	document.title = "Previous Page";
	conversation.profile = null;
});

afterEach(cleanup);

describe("ConversationScreen window title", () => {
	it("names the peer", () => {
		conversation.profile = { name: "Alex" };

		openConversation();

		expect(document.title).toBe("Alex — Open Grind");
	});

	it.each([
		["while the conversation loads", null],
		["for a peer without a name", { name: "" }],
	])("falls back to Conversation %s", (_name, profile) => {
		conversation.profile = profile;

		openConversation();

		expect(document.title).toBe("Conversation — Open Grind");
	});

	it("leaves the title to the next page while it leaves", () => {
		conversation.profile = { name: "Alex" };

		openConversation({ leaving: true });

		expect(document.title).toBe("Previous Page");
	});
});
