// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { type ComponentProps, tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock, toastMock, writeTextMock } = vi.hoisted(() => ({
	playHapticMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn() },
	writeTextMock: vi.fn(),
}));
vi.mock("#lib/haptics.ts", () => ({
	hapticsAvailable: () => true,
	playHaptic: playHapticMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));

import { apiResponseMessageSchema } from "#lib/model/messaging/messages.ts";
import { contextMenuEvent } from "#lib/test/context-menu.ts";
import { useHoldClock } from "#lib/test/long-press.ts";
import { runningOn } from "#lib/test/platform.ts";
import { pointerEvent } from "#lib/test/pointer.ts";
import { untranslatableTexts } from "#lib/test/untranslatable.ts";
import { LONG_PRESS_DURATION_MS } from "#lib/util/long-press.ts";
import Message from "./Message.svelte";

const MESSAGE_ROW = '[data-slot="message"] [role="article"]';
const SENT_AT = new Date(2026, 9, 5, 9, 5);

type MessageActions = Pick<
	ComponentProps<typeof Message>,
	"onDelete" | "onReact" | "onReply"
>;

function renderMessage({
	type,
	body,
	replyToMessage,
	isRead = null,
	status,
	actions = {},
}: {
	type: string;
	body: Record<string, unknown>;
	replyToMessage?: { type: string; body: Record<string, unknown> };
	isRead?: boolean | null;
	status?: "sent" | "pending" | "error";
	actions?: MessageActions;
}) {
	const { container } = render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "m1",
				conversationId: "100001:100002",
				senderId: 100002,
				timestamp: SENT_AT.getTime(),
				type,
				body,
				replyToMessage: replyToMessage && {
					messageId: "m0",
					senderId: 100001,
					...replyToMessage,
				},
			}),
			isOut: false,
			isRead,
			indexInStack: 0,
			stackLength: 1,
			status,
			...actions,
		},
	});
	const row = container.querySelector<HTMLElement>(MESSAGE_ROW);
	if (row === null) throw new Error("Missing message row");
	return row;
}

function renderTextMessage(actions?: MessageActions) {
	return renderMessage({
		type: "Text",
		body: { text: "hello there" },
		actions,
	});
}

function actionsButton(row: HTMLElement) {
	return within(row).getByRole("button", { name: "Message actions" });
}

async function menuOpened(row: HTMLElement): Promise<boolean> {
	await tick();
	return row.style.visibility === "hidden";
}

function menuDialog(): HTMLDialogElement {
	const dialog = document.querySelector("dialog");
	if (dialog === null) throw new Error("Missing message menu");
	return dialog;
}

async function openMenu(row: HTMLElement): Promise<HTMLDialogElement> {
	actionsButton(row).click();
	await tick();
	return menuDialog();
}

beforeEach(() => {
	runningOn("windows");
});

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

describe("message translation boundary", () => {
	it("keeps the words of a text message out of page translation", () => {
		expect(untranslatableTexts(renderTextMessage())).toEqual([
			"hello there",
		]);
	});

	it("keeps quoted words out of page translation but not a quoted type label", () => {
		const quotingText = renderMessage({
			type: "Text",
			body: { text: "sure" },
			replyToMessage: { type: "Text", body: { text: "lunch?" } },
		});

		expect(untranslatableTexts(quotingText)).toEqual(["lunch?", "sure"]);
		cleanup();

		const quotingPhoto = renderMessage({
			type: "Text",
			body: { text: "sure" },
			replyToMessage: {
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
			},
		});

		expect(quotingPhoto.textContent).toContain("Photo");
		expect(untranslatableTexts(quotingPhoto)).toEqual(["sure"]);
	});

	it("keeps an unsupported wire type out of page translation", () => {
		const row = renderMessage({ type: "SomethingNew", body: {} });

		expect(row.textContent?.trim()).toBe(
			"Unsupported message type: SomethingNew",
		);
		expect(untranslatableTexts(row)).toEqual(["SomethingNew"]);
	});

	it("keeps a Gaymoji's name out of page translation", () => {
		const row = renderMessage({
			type: "Gaymoji",
			body: { imageHash: "gaymoji/4_Happy_Mask.png" },
		});

		expect(
			within(row)
				.getByRole("img", { name: "Happy Mask" })
				.closest("[translate]")
				?.getAttribute("translate"),
		).toBe("no");
	});
});

describe("message status line", () => {
	it.each([
		{ isRead: true, status: "sent", text: "Read 9:05 AM" },
		{ isRead: false, status: "sent", text: "Sent 9:05 AM" },
		{ isRead: null, status: "sent", text: "9:05 AM" },
		{ isRead: false, status: "pending", text: "Sending…" },
		{ isRead: false, status: "error", text: "Not sent" },
	] as const)(
		"reads $text for a $status message in local time",
		({ isRead, status, text }) => {
			renderMessage({
				type: "Text",
				body: { text: "hello there" },
				isRead,
				status,
			});

			expect(screen.queryAllByText(text)).toHaveLength(1);
		},
	);
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

describe("message menu", () => {
	it("names the fire icon with the end of the double-tap hint", async () => {
		const row = renderTextMessage();
		const dialog = await openMenu(row);
		const fireIcon = within(dialog).getByAltText("react with fire");

		expect(fireIcon.parentElement?.textContent?.trim()).toBe(
			"Double tap to",
		);
	});

	it("copies the message words, says so and closes", async () => {
		const row = renderTextMessage();
		const dialog = await openMenu(row);

		within(dialog).getByRole("menuitem", { name: "Copy message" }).click();

		await vi.waitFor(() => {
			expect(toastMock.success).toHaveBeenCalledExactlyOnceWith(
				"Message copied to clipboard",
			);
		});
		expect(writeTextMock).toHaveBeenCalledExactlyOnceWith("hello there");
		expect(toastMock.error).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(row.style.visibility).toBe(""));
	});

	it("reports a copy the clipboard refuses instead of claiming it copied", async () => {
		writeTextMock.mockRejectedValue(new Error("no clipboard"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const row = renderTextMessage();
		const dialog = await openMenu(row);

		within(dialog).getByRole("menuitem", { name: "Copy message" }).click();

		await vi.waitFor(() => {
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Couldn’t copy to clipboard",
			);
		});
		expect(toastMock.success).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(row.style.visibility).toBe(""));
	});
});

describe("message actions button", () => {
	it("gives the keyboard a menu button instead of making the row a tab stop", () => {
		const row = renderTextMessage();
		const button = actionsButton(row);

		expect(row.hasAttribute("tabindex")).toBe(false);
		expect(row.hasAttribute("aria-keyshortcuts")).toBe(false);
		expect(button.dataset.slot).toBe("message-actions");
		expect(button.getAttribute("aria-haspopup")).toBe("menu");
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
		const dialog = await openMenu(row);
		within(dialog).getByRole("menuitem", { name: "Copy message" }).focus();

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
		const dialog = menuDialog();
		within(dialog).getByRole("menuitem", { name: "Copy message" }).focus();

		dialog.close();

		await vi.waitFor(() => expect(row.style.visibility).toBe(""));
		await tick();
		expect(document.activeElement).toBe(document.body);
		composer.remove();
	});
});

describe("message menu on iOS", () => {
	useHoldClock();

	beforeEach(() => {
		runningOn("ios");
	});

	it("opens once a touch is held still, with one haptic tap", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);

		expect(await menuOpened(row)).toBe(true);
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays closed when the finger drifts past the hold's tolerance", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(100);
		row.dispatchEvent(pointerEvent("pointermove", { x: 23 }));
		vi.advanceTimersByTime(1000);

		expect(await menuOpened(row)).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("keeps the menu of a message that can't be selected open through the mouse events WebKit sends when the hold lifts", async () => {
		const row = renderMessage({
			type: "SomethingNew",
			body: {},
			actions: { onDelete: () => {} },
		});

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
		expect(await menuOpened(row)).toBe(true);
		row.dispatchEvent(pointerEvent("pointerup"));
		const dialog = menuDialog();
		for (const type of ["mousedown", "mouseup", "click"]) {
			dialog.dispatchEvent(new MouseEvent(type, { bubbles: true }));
		}
		await tick();

		expect(dialog.open).toBe(true);
	});

	it("neither opens nor taps for a message with no actions", async () => {
		const row = renderMessage({ type: "SomethingNew", body: {} });

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);

		expect(await menuOpened(row)).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("still reacts to a double tap", () => {
		const onReact = vi.fn();
		const row = renderTextMessage({ onReact });

		for (let tap = 0; tap < 2; tap += 1) {
			row.dispatchEvent(pointerEvent("pointerdown"));
			row.dispatchEvent(pointerEvent("pointerup"));
		}
		row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

		expect(onReact).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("drops a swipe the finger starts once the menu is open", async () => {
		const onReply = vi.fn();
		const row = renderTextMessage({ onReply });

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
		expect(await menuOpened(row)).toBe(true);
		row.dispatchEvent(pointerEvent("pointermove", { x: 90 }));
		row.dispatchEvent(pointerEvent("pointerup", { x: 90 }));

		expect(onReply).not.toHaveBeenCalled();
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});
});

describe("message menu on Android", () => {
	useHoldClock();

	beforeEach(() => {
		runningOn("android");
	});

	it("leaves a touch hold to the system's own long press", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(1000);

		expect(await menuOpened(row)).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("drops a swipe the finger starts once the menu is open", async () => {
		const onReply = vi.fn();
		const row = renderTextMessage({ onReply });

		row.dispatchEvent(pointerEvent("pointerdown"));
		row.dispatchEvent(contextMenuEvent({ pointerType: "touch" }));
		expect(await menuOpened(row)).toBe(true);
		row.dispatchEvent(pointerEvent("pointermove", { x: 90 }));
		row.dispatchEvent(pointerEvent("pointerup", { x: 90 }));

		expect(onReply).not.toHaveBeenCalled();
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("leaves a swipe in flight alone when a mouse right-click opens the menu", async () => {
		const onReply = vi.fn();
		const row = renderTextMessage({ onReply });

		row.dispatchEvent(pointerEvent("pointerdown"));
		row.dispatchEvent(pointerEvent("pointermove", { x: 90 }));
		row.dispatchEvent(contextMenuEvent({ pointerType: "mouse" }));
		expect(await menuOpened(row)).toBe(true);
		row.dispatchEvent(pointerEvent("pointerup", { x: 90 }));

		expect(onReply).toHaveBeenCalledOnce();
	});
});
