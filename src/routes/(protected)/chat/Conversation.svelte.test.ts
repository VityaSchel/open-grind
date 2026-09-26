// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";

const { conversations, currentPage, playHapticMock } = vi.hoisted(() => ({
	conversations: { drafts: null as Drafts | null },
	currentPage: { params: {} },
	playHapticMock: vi.fn(),
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

import { contextMenuEvent } from "$lib/test/context-menu";
import type { Conversation as ConversationType } from "$lib/model/messaging/conversations";
import Conversation from "./Conversation.svelte";

const DESCRIPTION = '[data-slot="item-description"]';
const DRAFT_PREFIX = '[data-slot="conversation-draft-prefix"]';
const MENU_TRIGGER = '[data-slot="context-menu-trigger"]';
const CONVERSATION_ID = "a:1";
const BITS_HOLD_MS = 750;

let drafts: Drafts;

function conversation(
	preview: ConversationType["data"]["preview"],
	unreadCount = 0,
): ConversationType {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId: CONVERSATION_ID,
			name: "Someone",
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
			unreadCount,
			preview,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "NOT_ACTIVE",
			onlineUntil: null,
			hasUnreadThrob: false,
		},
	};
}

function textPreview(text: string): ConversationType["data"]["preview"] {
	return {
		type: "Text",
		text,
		albumId: null,
		imageHash: null,
		lat: null,
		lon: null,
		duration: null,
		photoContentReply: null,
	};
}

function renderRow(
	preview: ConversationType["data"]["preview"],
	unreadCount = 0,
) {
	return render(Conversation, {
		props: {
			conversation: conversation(preview, unreadCount),
			onEnterSelection: () => {},
		},
	});
}

function descriptionClass(container: HTMLElement): string {
	return container.querySelector(DESCRIPTION)?.className ?? "";
}

function previewLine(container: HTMLElement): string {
	const text = container.querySelector(DESCRIPTION)?.textContent ?? "";
	return text.replaceAll("\u00a0", " ").trim();
}

describe("Conversation preview line", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
	});

	afterEach(cleanup);

	it("shows the last message when there is no draft", () => {
		const { container } = renderRow(textPreview("hello there"));

		expect(previewLine(container)).toBe("hello there");
	});

	it("replaces the preview with the draft, one space after the prefix", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(textPreview("hello there"));

		expect(previewLine(container)).toBe("Draft: see you at");
	});

	it("joins the prefix to the draft with a non-breaking space", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(textPreview("hello there"));

		expect(container.querySelector(DESCRIPTION)?.textContent).toBe(
			"Draft:\u00a0see you at",
		);
	});

	it("carries the prefix as its own element inside the preview line", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(textPreview("hello there"));

		expect(
			container
				.querySelector(`${DESCRIPTION} ${DRAFT_PREFIX}`)
				?.textContent?.trim(),
		).toBe("Draft:");
	});

	it("shows the draft even when no preview can be rendered", () => {
		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container } = renderRow(null);

		expect(previewLine(container)).toBe("Draft: see you at");
	});

	it("falls back to the unavailable notice with neither draft nor preview", () => {
		const { container } = renderRow(null);

		expect(previewLine(container)).toBe("Preview not available");
	});

	it("follows the draft as it is saved and cleared", async () => {
		const { container } = renderRow(textPreview("hello there"));

		drafts.save({ conversationId: CONVERSATION_ID, text: "typing" });
		await tick();
		expect(previewLine(container)).toBe("Draft: typing");

		drafts.save({ conversationId: CONVERSATION_ID, text: "" });
		await tick();
		expect(previewLine(container)).toBe("hello there");
	});

	it("emphasizes an unread message but never the user's own draft", () => {
		const { container: unread } = renderRow(
			textPreview("can't make it"),
			1,
		);

		expect(descriptionClass(unread)).toContain("text-white");
		cleanup();

		drafts.save({ conversationId: CONVERSATION_ID, text: "see you at" });
		const { container: drafted } = renderRow(
			textPreview("can't make it"),
			1,
		);

		expect(descriptionClass(drafted)).not.toContain("text-white");
	});

	it("ignores a draft belonging to another conversation", () => {
		drafts.save({ conversationId: "b:2", text: "not mine" });
		const { container } = renderRow(textPreview("hello there"));

		expect(previewLine(container)).toBe("hello there");
	});
});

function renderRowWithMenu(): HTMLElement {
	const { container } = render(Conversation, {
		props: { conversation: conversation(null) },
	});
	const trigger = container.querySelector<HTMLElement>(MENU_TRIGGER);
	if (trigger === null) throw new Error("Missing context menu trigger");
	return trigger;
}

function pointerDown(pointerType: string): MouseEvent {
	return Object.assign(new MouseEvent("pointerdown", { bubbles: true }), {
		pointerType,
	});
}

async function menuOpened(trigger: HTMLElement): Promise<boolean> {
	await tick();
	return trigger.getAttribute("data-state") === "open";
}

describe("Conversation menu haptics", () => {
	beforeEach(() => {
		conversations.drafts = new Drafts();
		playHapticMock.mockReset();
	});

	afterEach(cleanup);

	it("taps once when a touch long press opens the menu", async () => {
		const trigger = renderRowWithMenu();

		trigger.dispatchEvent(pointerDown("touch"));
		trigger.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));

		expect(await menuOpened(trigger)).toBe(true);
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("taps when the menu's own hold timer opens it for a touch", async () => {
		const trigger = renderRowWithMenu();

		trigger.dispatchEvent(pointerDown("touch"));
		await new Promise((resolve) => setTimeout(resolve, BITS_HOLD_MS));

		expect(await menuOpened(trigger)).toBe(true);
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet when a right-click opens the menu", async () => {
		const trigger = renderRowWithMenu();

		trigger.dispatchEvent(pointerDown("mouse"));
		trigger.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));

		expect(await menuOpened(trigger)).toBe(true);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when the menu key opens the menu after a touch", async () => {
		const trigger = renderRowWithMenu();

		trigger.dispatchEvent(pointerDown("touch"));
		trigger.dispatchEvent(contextMenuEvent({ pointerType: "" }));

		expect(await menuOpened(trigger)).toBe(true);
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});
