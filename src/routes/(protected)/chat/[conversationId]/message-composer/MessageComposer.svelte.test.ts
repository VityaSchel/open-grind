// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "$lib/chat/drafts.svelte";
import { draftFromMessage } from "$lib/model/messaging/messages";

const { conversations } = vi.hoisted(() => ({
	conversations: { drafts: null as Drafts | null },
}));

vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getConversations: () => conversations,
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

class InstantAnimation {
	onfinish: (() => void) | null = null;
	constructor() {
		queueMicrotask(() => this.onfinish?.());
	}
	cancel() {}
}
Element.prototype.animate = () =>
	new InstantAnimation() as unknown as Animation;

import MessageComposer from "./MessageComposer.svelte";

const A = "a:1";
const B = "b:2";

let drafts: Drafts;

function renderComposer({
	conversationId = A,
	onSend = () => {},
	replyTo = null,
	onCancelReply = () => {},
}: {
	conversationId?: string;
	onSend?: (drafts: unknown) => void | Promise<void>;
	replyTo?: unknown;
	onCancelReply?: () => void;
} = {}) {
	const result = render(MessageComposer, {
		props: {
			conversationId,
			onSend,
			disabled: false,
			replyTo,
			onCancelReply,
		} as never,
	});
	return { ...result, textarea: result.container.querySelector("textarea")! };
}

function type(textarea: HTMLTextAreaElement, value: string) {
	return fireEvent.input(textarea, { target: { value } });
}

describe("MessageComposer drafts", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
	});

	afterEach(cleanup);

	it("opens empty when the conversation has no draft", () => {
		expect(renderComposer().textarea.value).toBe("");
	});

	it("restores the stored draft on open", () => {
		drafts.save({ conversationId: A, text: "see you at" });

		expect(renderComposer().textarea.value).toBe("see you at");
	});

	it("saves what was typed when the conversation changes", async () => {
		const { textarea, rerender } = renderComposer();

		await type(textarea, "for a");
		await rerender({ conversationId: B });

		expect(drafts.get(A)).toBe("for a");
	});

	it("swaps to the other conversation's draft instead of carrying text over", async () => {
		drafts.save({ conversationId: B, text: "for b" });
		const { textarea, rerender } = renderComposer();

		await type(textarea, "for a");
		await rerender({ conversationId: B });

		expect(textarea.value).toBe("for b");
	});

	it("empties the composer for a conversation without a draft", async () => {
		const { textarea, rerender } = renderComposer();

		await type(textarea, "for a");
		await rerender({ conversationId: B });

		expect(textarea.value).toBe("");
	});

	it("saves what was typed when the composer goes away", async () => {
		const { textarea, unmount } = renderComposer();

		await type(textarea, "for a");
		unmount();

		expect(drafts.get(A)).toBe("for a");
	});

	it("keeps no draft for a conversation that was only visited", () => {
		const { unmount } = renderComposer();

		unmount();

		expect(drafts.get(A)).toBe("");
	});

	it("takes drafts again for a conversation reopened after it was forgotten", async () => {
		drafts.forget(A);
		const { textarea, unmount } = renderComposer();

		await type(textarea, "hi again");
		unmount();

		expect(drafts.get(A)).toBe("hi again");
	});

	it("takes drafts again after switching to a forgotten conversation", async () => {
		drafts.forget(B);
		const { textarea, rerender, unmount } = renderComposer();

		await rerender({ conversationId: B });
		await type(textarea, "for b");
		unmount();

		expect(drafts.get(B)).toBe("for b");
	});

	it("drops the draft once the message is sent", async () => {
		drafts.save({ conversationId: A, text: "old" });
		const { textarea } = renderComposer();

		await type(textarea, "sending this");
		await fireEvent.submit(textarea.form!);
		await tick();

		expect(drafts.get(A)).toBe("");
		expect(textarea.value).toBe("");
	});

	it("sends the typed text, not the restored draft", async () => {
		drafts.save({ conversationId: A, text: "old" });
		const onSend = vi.fn();
		const { textarea } = renderComposer({ onSend });

		await type(textarea, "sending this");
		await fireEvent.submit(textarea.form!);
		await tick();

		expect(onSend).toHaveBeenCalledWith([
			draftFromMessage({ type: "Text", body: { text: "sending this" } }),
		]);
	});
});

describe("MessageComposer reply bar", () => {
	beforeEach(() => {
		drafts = new Drafts();
		conversations.drafts = drafts;
	});

	afterEach(cleanup);

	function quoted(overrides: Record<string, unknown> = {}) {
		return {
			type: "Text",
			body: { text: "the quoted text" },
			messageId: "msg-quoted",
			conversationId: A,
			senderId: 7,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
			...overrides,
		};
	}

	it("shows nothing when no reply is armed", () => {
		const { queryByLabelText } = renderComposer();

		expect(queryByLabelText("Cancel reply")).toBeNull();
	});

	it("names the message being replied to", () => {
		const { getByText } = renderComposer({ replyTo: quoted() });

		expect(getByText("the quoted text")).toBeTruthy();
	});

	it.each([
		["Image", { mediaId: 1, width: null, height: null }, "Photo"],
		["Audio", { mediaId: 1 }, "Voice message"],
		["Giphy", { id: "g" }, "GIF"],
	])(
		"names a %s reply rather than showing a blank bar",
		(type, body, label) => {
			const { getByText } = renderComposer({
				replyTo: quoted({ type, body }),
			});

			expect(getByText(label)).toBeTruthy();
		},
	);

	it("cancels the reply when the close button is used", async () => {
		const onCancelReply = vi.fn();
		const { getByLabelText } = renderComposer({
			replyTo: quoted(),
			onCancelReply,
		});

		await fireEvent.click(getByLabelText("Cancel reply"));

		expect(onCancelReply).toHaveBeenCalledOnce();
	});

	it("cancels the reply on Escape, so the keyboard can back out", async () => {
		const onCancelReply = vi.fn();
		const { textarea } = renderComposer({
			replyTo: quoted(),
			onCancelReply,
		});

		await fireEvent.keyDown(textarea, { key: "Escape" });

		expect(onCancelReply).toHaveBeenCalledOnce();
	});

	it("hands focus to the composer when a reply is armed", async () => {
		const { textarea } = renderComposer({ replyTo: quoted() });
		await tick();

		expect(document.activeElement).toBe(textarea);
	});
});
