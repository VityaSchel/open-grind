import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentPlatformMock } = vi.hoisted(() => ({
	currentPlatformMock: vi.fn(() => "macos"),
}));
vi.mock("#lib/platform/os.ts", () => ({
	currentPlatform: currentPlatformMock,
}));

import {
	bindContextMenuKey,
	dispatchContextMenu,
} from "#lib/platform/context-menu-key.ts";

type KeyInit = KeyboardEventInit & { type?: "keydown" | "keyup" };

class PointerEventStub extends MouseEvent {
	readonly pointerType: string;

	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.pointerType = init.pointerType ?? "";
	}
}

const releases: (() => void)[] = [];
const menus: MouseEvent[] = [];

function recordMenus(event: MouseEvent) {
	menus.push(event);
}

function focusedButton(): HTMLButtonElement {
	const button = document.createElement("button");
	button.getBoundingClientRect = () => new DOMRect(100, 200, 40, 20);
	document.body.append(button);
	button.focus();
	return button;
}

function press({ type = "keydown", ...init }: KeyInit): KeyboardEvent {
	const event = new KeyboardEvent(type, {
		bubbles: true,
		cancelable: true,
		...init,
	});
	(document.activeElement ?? document.body).dispatchEvent(event);
	return event;
}

function pressAndRelease(init: KeyboardEventInit): KeyboardEvent[] {
	return [press(init), press({ ...init, type: "keyup" })];
}

function bindOn(platform: string) {
	currentPlatformMock.mockReturnValue(platform);
	releases.push(bindContextMenuKey());
}

beforeEach(() => {
	vi.stubGlobal("PointerEvent", PointerEventStub);
	window.addEventListener("contextmenu", recordMenus);
});

afterEach(() => {
	vi.unstubAllGlobals();
	for (const release of releases.splice(0)) release();
	window.removeEventListener("contextmenu", recordMenus);
	menus.length = 0;
	document.body.replaceChildren();
});

describe("bindContextMenuKey", () => {
	it("opens the focused element's menu once on Shift+F10", () => {
		bindOn("linux");
		const button = focusedButton();

		const [down, up] = pressAndRelease({ key: "F10", shiftKey: true });

		expect(menus).toHaveLength(1);
		expect(menus[0]!.target).toBe(button);
		expect(menus[0]!.bubbles).toBe(true);
		expect(menus[0]!.cancelable).toBe(true);
		expect(down!.defaultPrevented).toBe(true);
		expect(up!.defaultPrevented).toBe(true);
	});

	it.each(["macos", "ios", "linux", "android"])(
		"opens on the context menu key's press on %s",
		(platform) => {
			bindOn(platform);
			focusedButton();

			const down = press({ key: "ContextMenu" });

			expect(menus).toHaveLength(1);
			expect(down.defaultPrevented).toBe(true);
			expect(press({ key: "ContextMenu", type: "keyup" })).toHaveProperty(
				"defaultPrevented",
				true,
			);
			expect(menus).toHaveLength(1);
		},
	);

	it("opens on the context menu key's release on Windows, holding back the native menu on both", () => {
		bindOn("windows");
		focusedButton();

		const down = press({ key: "ContextMenu" });
		expect(menus).toHaveLength(0);
		expect(down.defaultPrevented).toBe(true);

		const up = press({ key: "ContextMenu", type: "keyup" });
		expect(menus).toHaveLength(1);
		expect(up.defaultPrevented).toBe(true);
	});

	it("opens on Shift+F10's press on Windows", () => {
		bindOn("windows");
		focusedButton();

		press({ key: "F10", shiftKey: true });

		expect(menus).toHaveLength(1);
	});

	it("places the menu at the middle of the part of the element on screen", () => {
		bindOn("macos");
		const button = focusedButton();
		button.getBoundingClientRect = () =>
			new DOMRect(-40, window.innerHeight - 10, 100, 30);

		press({ key: "F10", shiftKey: true });

		expect(menus[0]!.clientX).toBe(30);
		expect(menus[0]!.clientY).toBe(window.innerHeight - 5);
	});

	it.each([
		["a text field", "<input type='text'>"],
		["a text area", "<textarea></textarea>"],
		[
			"an editable region",
			"<div contenteditable='true' tabindex='0'></div>",
		],
	])("leaves %s its native text menu", (_, html) => {
		bindOn("windows");
		document.body.innerHTML = html;
		(document.body.firstElementChild as HTMLElement).focus();

		const events = [
			...pressAndRelease({ key: "ContextMenu" }),
			...pressAndRelease({ key: "F10", shiftKey: true }),
		];

		expect(menus).toHaveLength(0);
		expect(events.map((event) => event.defaultPrevented)).toEqual([
			false,
			false,
			false,
			false,
		]);
	});

	it("does nothing while nothing has focus", () => {
		bindOn("linux");

		const events = [
			...pressAndRelease({ key: "ContextMenu" }),
			...pressAndRelease({ key: "F10", shiftKey: true }),
		];

		expect(menus).toHaveLength(0);
		expect(events.some((event) => event.defaultPrevented)).toBe(false);
	});

	it.each([
		["F10", { key: "F10" }],
		["Control+Shift+F10", { key: "F10", shiftKey: true, ctrlKey: true }],
		["Alt+Shift+F10", { key: "F10", shiftKey: true, altKey: true }],
		["Meta+Shift+F10", { key: "F10", shiftKey: true, metaKey: true }],
		["Shift+ContextMenu", { key: "ContextMenu", shiftKey: true }],
		["Control+ContextMenu", { key: "ContextMenu", ctrlKey: true }],
	])("ignores %s", (_, init) => {
		bindOn("linux");
		focusedButton();

		const [down] = pressAndRelease(init);

		expect(menus).toHaveLength(0);
		expect(down!.defaultPrevented).toBe(false);
	});

	it("opens once while the key auto-repeats", () => {
		bindOn("linux");
		focusedButton();

		press({ key: "ContextMenu" });
		const repeated = press({ key: "ContextMenu", repeat: true });

		expect(menus).toHaveLength(1);
		expect(repeated.defaultPrevented).toBe(true);
	});

	it("leaves keys that the app already handled", () => {
		bindOn("linux");
		const button = focusedButton();
		button.addEventListener("keydown", (event) => event.preventDefault());

		press({ key: "F10", shiftKey: true });

		expect(menus).toHaveLength(0);
	});

	it("stops listening once released", () => {
		currentPlatformMock.mockReturnValue("linux");
		const release = bindContextMenuKey();
		focusedButton();
		release();

		const down = press({ key: "ContextMenu" });

		expect(menus).toHaveLength(0);
		expect(down.defaultPrevented).toBe(false);
	});
});

describe("dispatchContextMenu", () => {
	it("sends a bubbling, cancelable contextmenu from inside the element that no pointer fired", () => {
		const button = focusedButton();
		const reached: MouseEvent[] = [];
		document.body.addEventListener("contextmenu", (event) =>
			reached.push(event),
		);

		dispatchContextMenu(button);

		expect(reached).toHaveLength(1);
		expect(reached[0]).toBeInstanceOf(MouseEvent);
		expect(reached[0]).toMatchObject({
			target: button,
			pointerType: "",
			button: 2,
			clientX: 120,
			clientY: 210,
			cancelable: true,
		});
	});
});
