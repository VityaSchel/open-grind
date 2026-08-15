// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";
import { buttonVariants } from "$lib/components/ui/button";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import ComposerReplyPreview from "./ComposerReplyPreview.svelte";
import MessageComposer from "./MessageComposer.svelte";

const { conversations } = vi.hoisted(() => ({
	conversations: { drafts: null as Drafts | null },
}));

vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));

// the module builds a WsState on import, which reaches for a Tauri host that a
// jsdom run has no business providing
vi.mock("$lib/ws.svelte", () => ({
	ws: {
		status: "connected",
		connect: () => {},
		on: () => Promise.resolve(() => {}),
		onConnected: () => Promise.resolve(() => {}),
		onEventsDropped: () => Promise.resolve(() => {}),
		send: () => {},
		sendCommand: () => Promise.resolve(undefined),
	},
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

const message = {
	type: "Text",
	body: { text: "the quoted text" },
	messageId: "msg-quoted",
	conversationId: "a:1",
	senderId: 7,
	timestamp: 1_710_000_000_000,
} as unknown as ApiResponseMessage;

function classesOf(element: Element): string[] {
	return (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function surfaceOf(element: Element): string | undefined {
	return classesOf(element).find((name) => name.startsWith("bg-"));
}

function renderPreview() {
	const onCancel = vi.fn();
	const { container } = render(ComposerReplyPreview, {
		props: { message, onCancel },
	});
	return {
		onCancel,
		pill: container.firstElementChild!,
		close: screen.getByRole("button", { name: "Cancel reply" }),
	};
}

function renderComposerReplying() {
	const { container } = render(MessageComposer, {
		props: {
			conversationId: "a:1",
			onSend: () => {},
			disabled: false,
			replyTo: message,
			onCancelReply: () => {},
		} as never,
	});
	const close = container.querySelector('[aria-label="Cancel reply"]')!;
	return {
		pill: close.closest("div")!,
		input: container.querySelector('[class~="rounded-composer"]')!,
	};
}

describe("ComposerReplyPreview", () => {
	beforeEach(() => {
		conversations.drafts = new Drafts();
	});

	afterEach(cleanup);

	it("names the message being replied to", () => {
		renderPreview();

		expect(screen.getByText("the quoted text")).toBeTruthy();
	});

	it("cancels the reply when the close control is clicked", async () => {
		const { close, onCancel } = renderPreview();

		await fireEvent.click(close);

		expect(onCancel).toHaveBeenCalledOnce();
	});

	it("shares the composer's surface instead of sitting on a lighter chip", () => {
		const { pill, input } = renderComposerReplying();

		expect(surfaceOf(pill)).toBe(surfaceOf(input));
	});

	// Measured: the fill alone is 1.104 against the page and 1.000 against the
	// composer input, so the edge is the only thing separating the two.
	it("draws an edge, since its fill matches what sits behind it", () => {
		const { pill } = renderComposerReplying();

		expect(classesOf(pill)).toEqual(
			expect.arrayContaining(["border", "border-border"]),
		);
	});

	it("builds the close control from the shared Button", () => {
		const { close } = renderPreview();

		expect(close.getAttribute("data-slot")).toBe("button");
		expect(classesOf(close)).toEqual(
			expect.arrayContaining(
				buttonVariants({ variant: "ghost" })
					.split(/\s+/)
					.filter(
						(name) =>
							name.startsWith("hover:") ||
							name.startsWith("focus-visible:"),
					),
			),
		);
	});
});
