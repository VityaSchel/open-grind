// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({
	hapticsAvailable: () => true,
	playHaptic: playHapticMock,
}));

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { contextMenuEvent } from "$lib/test/context-menu";
import Message from "./Message.svelte";

const MESSAGE_ROW = '[data-slot="message"] [role="button"]';

function renderMessage({
	type,
	body,
}: {
	type: string;
	body: Record<string, unknown>;
}) {
	const { container } = render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "m1",
				conversationId: "100001:100002",
				senderId: 100002,
				timestamp: 1_700_000_000_000,
				type,
				body,
			}),
			isOut: false,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
	const row = container.querySelector<HTMLElement>(MESSAGE_ROW);
	if (row === null) throw new Error("Missing message row");
	return row;
}

function renderTextMessage() {
	return renderMessage({ type: "Text", body: { text: "hello there" } });
}

async function menuOpened(row: HTMLElement): Promise<boolean> {
	await tick();
	return row.style.visibility === "hidden";
}

afterEach(() => {
	cleanup();
	playHapticMock.mockReset();
});

describe("message menu haptics", () => {
	it("taps once when a touch long press opens the menu", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));

		expect(await menuOpened(row)).toBe(true);
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet when a right-click opens the menu", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));

		expect(await menuOpened(row)).toBe(true);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when the keyboard opens the menu", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);

		expect(await menuOpened(row)).toBe(true);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when a touch long press finds no menu to open", async () => {
		const row = renderMessage({ type: "SomethingNew", body: {} });

		row.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));

		expect(await menuOpened(row)).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});
