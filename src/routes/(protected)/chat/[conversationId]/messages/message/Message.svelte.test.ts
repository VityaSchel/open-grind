// @vitest-environment jsdom

import { cleanup, render, within } from "@testing-library/svelte";
import { type ComponentProps, tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	Object.assign(globalThis, {
		__TAURI_OS_PLUGIN_INTERNALS__: { platform: "windows" },
	});
});
const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({
	hapticsAvailable: () => true,
	playHaptic: playHapticMock,
}));

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { contextMenuEvent } from "$lib/test/context-menu";
import { runningOn } from "$lib/test/platform";
import { pointerEvent } from "$lib/test/pointer";
import Message from "./Message.svelte";

const MESSAGE_ROW = '[data-slot="message"] [role="article"]';
const LONG_PRESS_MS = 450;

type MessageActions = Pick<
	ComponentProps<typeof Message>,
	"onDelete" | "onReact" | "onReply"
>;

function renderMessage({
	type,
	body,
	actions = {},
}: {
	type: string;
	body: Record<string, unknown>;
	actions?: MessageActions;
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

let clock = 1_700_000_000_000;

function useHoldClock() {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	vi.setSystemTime((clock += 60_000));
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

describe("message menu on iOS", () => {
	beforeEach(() => {
		runningOn("ios");
		useHoldClock();
	});

	afterEach(() => {
		window.dispatchEvent(new Event("pointerup"));
		vi.useRealTimers();
		runningOn("windows");
	});

	it("opens once a touch is held still, with one haptic tap", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);

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

	it.each([
		{
			kind: "a text message",
			message: { type: "Text", body: { text: "hello there" } },
		},
		{
			kind: "a message that can't be selected",
			message: {
				type: "SomethingNew",
				body: {},
				actions: { onDelete: () => {} },
			},
		},
	])(
		"keeps the menu of $kind open through the mouse events WebKit sends when the hold lifts",
		async ({ message }) => {
			const row = renderMessage(message);

			row.dispatchEvent(pointerEvent("pointerdown"));
			vi.advanceTimersByTime(LONG_PRESS_MS);
			expect(await menuOpened(row)).toBe(true);
			row.dispatchEvent(pointerEvent("pointerup"));
			const dialog = menuDialog();
			for (const type of ["mousedown", "mouseup", "click"]) {
				dialog.dispatchEvent(new MouseEvent(type, { bubbles: true }));
			}
			await tick();

			expect(dialog.open).toBe(true);
		},
	);

	it("neither opens nor taps for a message with no actions", async () => {
		const row = renderMessage({ type: "SomethingNew", body: {} });

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(LONG_PRESS_MS);

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
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(await menuOpened(row)).toBe(true);
		row.dispatchEvent(pointerEvent("pointermove", { x: 90 }));
		row.dispatchEvent(pointerEvent("pointerup", { x: 90 }));

		expect(onReply).not.toHaveBeenCalled();
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});
});

describe("message menu on Android", () => {
	beforeEach(() => {
		runningOn("android");
		useHoldClock();
	});

	afterEach(() => {
		vi.useRealTimers();
		runningOn("windows");
	});

	it("leaves a touch hold to the system's own long press", async () => {
		const row = renderTextMessage();

		row.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(1000);

		expect(await menuOpened(row)).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});
