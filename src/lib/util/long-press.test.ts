// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

import { longPressHandlers } from "./long-press";

function contextMenu(pointerType?: string) {
	const event = new MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
	});
	if (pointerType !== undefined) {
		Object.defineProperty(event, "pointerType", { value: pointerType });
	}
	return event as unknown as Parameters<
		NonNullable<ReturnType<typeof longPressHandlers>["oncontextmenu"]>
	>[0];
}

function pointer(type: string, pointerType: string) {
	const event = new MouseEvent(type, { bubbles: true, clientX: 10 });
	Object.defineProperty(event, "pointerType", { value: pointerType });
	return event as unknown as Parameters<
		NonNullable<ReturnType<typeof longPressHandlers>["onpointerdown"]>
	>[0];
}

let clock = 1_700_000_000_000;

beforeEach(() => {
	vi.useFakeTimers();
	clock += 60_000;
	vi.setSystemTime(clock);
	playHapticMock.mockReset();
});

afterEach(() => {
	window.dispatchEvent(new Event("pointerup"));
	vi.useRealTimers();
});

describe("longPressHandlers", () => {
	it("fires a touch hold once, though the browser also sends contextmenu", () => {
		const onLongPress = vi.fn();
		const handlers = longPressHandlers(onLongPress);

		handlers.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);
		vi.advanceTimersByTime(50);
		handlers.oncontextmenu?.(contextMenu("touch"));

		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it("opens on every right-click, however quickly they follow", () => {
		const onLongPress = vi.fn();
		const handlers = longPressHandlers(onLongPress);

		for (let click = 0; click < 2; click += 1) {
			handlers.onpointerdown?.(pointer("pointerdown", "mouse"));
			handlers.oncontextmenu?.(contextMenu("mouse"));
			vi.advanceTimersByTime(100);
		}

		expect(onLongPress).toHaveBeenCalledTimes(2);
	});

	it("keeps a contextmenu landing on another element right after a touch hold from firing again", () => {
		const first = vi.fn();
		const second = vi.fn();
		const pressed = longPressHandlers(first);
		const underFinger = longPressHandlers(second);

		pressed.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);
		vi.advanceTimersByTime(50);
		underFinger.oncontextmenu?.(contextMenu("touch"));

		expect(first).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
	});

	it("opens on every keyboard menu key press, however quickly they follow", () => {
		const onLongPress = vi.fn();
		const handlers = longPressHandlers(onLongPress);

		handlers.oncontextmenu?.(contextMenu(""));
		vi.advanceTimersByTime(100);
		handlers.oncontextmenu?.(contextMenu(""));

		expect(onLongPress).toHaveBeenCalledTimes(2);
	});

	it("opens from the menu key after a right-click whose pointerup landed on the menu", () => {
		const onLongPress = vi.fn();
		const handlers = longPressHandlers(onLongPress);

		handlers.onpointerdown?.(pointer("pointerdown", "mouse"));
		handlers.oncontextmenu?.(contextMenu("mouse"));
		vi.advanceTimersByTime(1000);
		handlers.oncontextmenu?.(contextMenu(""));

		expect(onLongPress).toHaveBeenCalledTimes(2);
	});

	it("ignores the mouse-typed contextmenu WebKitGTK sends when a fired touch hold lifts", () => {
		const onLongPress = vi.fn();
		const handlers = longPressHandlers(onLongPress);

		handlers.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);
		window.dispatchEvent(new Event("pointerup"));
		handlers.onpointerup?.(pointer("pointerup", "touch"));
		handlers.oncontextmenu?.(contextMenu("mouse"));

		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it("lets the next press click even while the hold's click is still being suppressed", () => {
		const handlers = longPressHandlers(() => {});
		const button = document.createElement("button");
		const onClick = vi.fn();
		button.addEventListener("click", onClick);
		document.body.append(button);

		handlers.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);
		handlers.onpointerup?.(pointer("pointerup", "touch"));
		vi.advanceTimersByTime(250);
		button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		button.click();

		expect(onClick).toHaveBeenCalledOnce();
		button.remove();
	});

	it("still swallows the click a fired touch hold leaves behind", () => {
		const handlers = longPressHandlers(() => {});
		const button = document.createElement("button");
		const onClick = vi.fn();
		button.addEventListener("click", onClick);
		document.body.append(button);

		handlers.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);
		handlers.onpointerup?.(pointer("pointerup", "touch"));
		button.click();

		expect(onClick).not.toHaveBeenCalled();
		button.remove();
	});
});

describe("long-press haptics", () => {
	it("taps once when a touch hold fires, though the browser also sends contextmenu", () => {
		const handlers = longPressHandlers(() => {});

		handlers.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);
		vi.advanceTimersByTime(50);
		handlers.oncontextmenu?.(contextMenu("touch"));

		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("taps when a pen hold fires", () => {
		const handlers = longPressHandlers(() => {});

		handlers.onpointerdown?.(pointer("pointerdown", "pen"));
		vi.advanceTimersByTime(450);

		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("taps when a touch contextmenu opens the menu before the timer", () => {
		const handlers = longPressHandlers(() => {});

		handlers.oncontextmenu?.(contextMenu("touch"));

		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet for right-clicks and the keyboard menu key", () => {
		const handlers = longPressHandlers(() => {});

		handlers.onpointerdown?.(pointer("pointerdown", "mouse"));
		handlers.oncontextmenu?.(contextMenu("mouse"));
		vi.advanceTimersByTime(1000);
		handlers.oncontextmenu?.(contextMenu(""));

		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when a hold is cut short", () => {
		const handlers = longPressHandlers(() => {});

		handlers.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(300);
		handlers.onpointerup?.(pointer("pointerup", "touch"));
		vi.advanceTimersByTime(500);

		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet for a touch hold that lands too soon after another long press to fire", () => {
		const first = longPressHandlers(() => {});
		const onSecond = vi.fn();
		const second = longPressHandlers(onSecond);

		first.oncontextmenu?.(contextMenu());
		second.onpointerdown?.(pointer("pointerdown", "touch"));
		vi.advanceTimersByTime(450);

		expect(onSecond).not.toHaveBeenCalled();
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});
