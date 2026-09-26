// @vitest-environment jsdom

import { cleanup, render, within } from "@testing-library/svelte";
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

const MESSAGE_ROW = '[data-slot="message"] [role="article"]';

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

function actionsButton(row: HTMLElement) {
	return within(row).getByRole("button", { name: "Message actions" });
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

	it("stays quiet when the actions button opens the menu", async () => {
		const row = renderTextMessage();

		actionsButton(row).click();

		expect(await menuOpened(row)).toBe(true);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when the context menu key opens the menu", async () => {
		const row = renderTextMessage();

		actionsButton(row).dispatchEvent(contextMenuEvent({ pointerType: "" }));

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

describe("message actions button", () => {
	it("gives the keyboard a menu button instead of making the row a tab stop", () => {
		const row = renderTextMessage();
		const button = actionsButton(row);

		expect(row.hasAttribute("tabindex")).toBe(false);
		expect(row.hasAttribute("aria-keyshortcuts")).toBe(false);
		expect(button.dataset.slot).toBe("message-actions");
		expect(button.getAttribute("aria-haspopup")).toBe("dialog");
		expect(button.getAttribute("aria-expanded")).toBe("false");
	});

	it("leaves Enter on the row itself alone", async () => {
		const row = renderTextMessage();
		const enter = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
		});

		row.dispatchEvent(enter);

		expect(enter.defaultPrevented).toBe(false);
		expect(await menuOpened(row)).toBe(false);
	});

	it("opens the menu and reports it expanded", async () => {
		const row = renderTextMessage();
		const button = actionsButton(row);

		button.click();

		expect(await menuOpened(row)).toBe(true);
		expect(button.getAttribute("aria-expanded")).toBe("true");
	});

	it("is left out when the message has no actions", () => {
		const row = renderMessage({ type: "SomethingNew", body: {} });

		expect(
			within(row).queryByRole("button", { name: "Message actions" }),
		).toBeNull();
	});

	it("gets focus back when the menu closes", async () => {
		const row = renderTextMessage();
		const button = actionsButton(row);
		button.focus();
		button.click();
		await tick();
		const dialog = document.querySelector("dialog");
		if (dialog === null) throw new Error("Missing message menu");
		within(dialog).getByRole("button", { name: "Copy message" }).focus();

		dialog.close();

		await vi.waitFor(() => expect(document.activeElement).toBe(button));
		expect(button.getAttribute("aria-expanded")).toBe("false");
	});

	it("leaves focus alone when the menu was opened from outside the message", async () => {
		const row = renderTextMessage();
		const composer = document.createElement("textarea");
		document.body.append(composer);
		composer.focus();
		row.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));
		await tick();
		const dialog = document.querySelector("dialog");
		if (dialog === null) throw new Error("Missing message menu");
		within(dialog).getByRole("button", { name: "Copy message" }).focus();

		dialog.close();

		await vi.waitFor(() => expect(row.style.visibility).toBe(""));
		await tick();
		expect(document.activeElement).toBe(document.body);
		composer.remove();
	});
});
