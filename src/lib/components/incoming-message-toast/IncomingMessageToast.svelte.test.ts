// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { untranslatableTexts } from "$lib/test/untranslatable";
import IncomingMessageToast from "./IncomingMessageToast.svelte";

const { gotoMock, toastMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	toastMock: { dismiss: vi.fn() },
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const CONVERSATION_ID = "100001:100002";

function pointer({
	target,
	type,
	x = 0,
}: {
	target: Window | Element;
	type: string;
	x?: number;
}) {
	return fireEvent(
		target,
		new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0 }),
	);
}

function renderToast({
	senderName,
	type = "Text",
	body = { text: "hello" },
}: {
	senderName?: string;
	type?: string;
	body?: Record<string, unknown>;
} = {}) {
	return render(IncomingMessageToast, {
		props: {
			conversationId: CONVERSATION_ID,
			sender:
				senderName === undefined
					? undefined
					: { name: senderName, avatarMediaHash: null },
			message: apiResponseMessageSchema.parse({
				messageId: "m1",
				conversationId: CONVERSATION_ID,
				senderId: 100002,
				timestamp: 1_700_000_000_000,
				type,
				body,
			}),
		},
	});
}

function press() {
	renderToast({ senderName: "Sam" });
	return pointer({ target: screen.getByRole("button"), type: "pointerdown" });
}

describe("IncomingMessageToast", () => {
	beforeEach(() => {
		gotoMock.mockReset();
		toastMock.dismiss.mockReset();
	});

	afterEach(cleanup);

	it("opens the chat when a press ends where it began", async () => {
		await press();

		await pointer({ target: window, type: "pointerup" });

		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(
			`/chat/${CONVERSATION_ID}`,
		);
		expect(toastMock.dismiss).toHaveBeenCalledExactlyOnceWith(
			CONVERSATION_ID,
		);
	});

	it("stays put when the pointer travels before it lifts", async () => {
		await press();

		await pointer({ target: window, type: "pointermove", x: 11 });
		await pointer({ target: window, type: "pointerup", x: 11 });

		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("forgets a cancelled press, so a later release elsewhere opens nothing", async () => {
		await press();

		await pointer({ target: window, type: "pointercancel" });
		await pointer({ target: window, type: "pointerup" });

		expect(gotoMock).not.toHaveBeenCalled();
		expect(toastMock.dismiss).not.toHaveBeenCalled();
	});

	it("keeps the sender's name and words out of page translation", () => {
		const { container } = renderToast({ senderName: "Sam" });

		expect(untranslatableTexts(container)).toEqual(["Sam", "hello"]);
	});

	it("lets page translation reach the fallback name and a media label", () => {
		const { container } = renderToast({
			type: "Image",
			body: {
				mediaId: 1,
				width: 300,
				height: 400,
				url: "https://d3.cloudfront.net/chat/a.jpg?Expires=1700000900&Signature=s&Key-Pair-Id=K",
				imageHash: "a".repeat(64),
				takenOnGrindr: false,
				createdAt: null,
			},
		});

		expect(container.textContent).toContain("Someone");
		expect(container.textContent).toContain("Photo");
		expect(untranslatableTexts(container)).toEqual([]);
	});

	it("forgets a press still held when the toast goes away", async () => {
		await press();

		cleanup();
		await pointer({ target: window, type: "pointerup" });

		expect(gotoMock).not.toHaveBeenCalled();
	});
});
