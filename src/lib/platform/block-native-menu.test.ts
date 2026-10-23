import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

import {
	allowsNativeMenu,
	blockNativeMenu,
} from "$lib/platform/block-native-menu";
import { contextMenuEvent } from "$lib/test/context-menu";
import type { TouchOriginHints } from "$lib/platform/touch-origin";

function mount(html: string): HTMLElement {
	document.body.innerHTML = html;
	return document.body;
}

function query(selector: string): Element {
	const element = document.querySelector(selector);
	if (element === null) throw new Error(`Missing ${selector}`);
	return element;
}

function selectWord({
	text,
	word,
}: {
	text: Node | null;
	word: string;
}): Selection {
	if (text === null) throw new Error("Missing text");
	const start = text.textContent?.indexOf(word) ?? -1;
	if (start < 0) throw new Error(`Missing ${word}`);
	const selection = window.getSelection();
	if (selection === null) throw new Error("No selection");
	selection.setBaseAndExtent(text, start, text, start + word.length);
	return selection;
}

function select(node: Node): Selection {
	const selection = window.getSelection();
	if (selection === null) throw new Error("No selection");
	const range = document.createRange();
	range.selectNodeContents(node);
	selection.removeAllRanges();
	selection.addRange(range);
	return selection;
}

function contextMenuOn(
	target: Element,
	origin: TouchOriginHints = {},
): MouseEvent {
	const event = contextMenuEvent(origin);
	target.dispatchEvent(event);
	return event;
}

const MENU_POINT = { x: 32, y: 345 };
const MENU_TEXT = "Hi there you";
const SELECTED_WORD = "there";
const SELECTED_WORD_START = MENU_TEXT.indexOf(SELECTED_WORD);
const SELECTED_WORD_END = SELECTED_WORD_START + SELECTED_WORD.length;

function selectWordInMenu(): {
	menu: Element;
	text: Node;
	selection: Selection;
} {
	mount(`<dialog id="menu" open><p id="about">${MENU_TEXT}</p></dialog>`);
	const text = query("#about").firstChild;
	if (text === null) throw new Error("Missing text");
	return {
		menu: query("#menu"),
		text,
		selection: selectWord({ text, word: SELECTED_WORD }),
	};
}

function placeCaret({ node, offset }: { node: Node; offset: number }): void {
	Object.defineProperty(document, "caretRangeFromPoint", {
		configurable: true,
		value: (x: number, y: number) => {
			if (x !== MENU_POINT.x || y !== MENU_POINT.y) return null;
			const caret = document.createRange();
			caret.setStart(node, offset);
			return caret;
		},
	});
}

function reopenedSelectionMenuOn(target: Element): MouseEvent {
	const event = new MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		clientX: MENU_POINT.x,
		clientY: MENU_POINT.y,
	});
	for (const coordinate of ["pageX", "pageY", "offsetX", "offsetY"]) {
		Object.defineProperty(event, coordinate, { value: 0 });
	}
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	window.getSelection()?.removeAllRanges();
	document.body.innerHTML = "";
	Reflect.deleteProperty(document, "caretRangeFromPoint");
	Reflect.deleteProperty(document, "caretPositionFromPoint");
});

describe("allowsNativeMenu", () => {
	it("allows it on a text input", () => {
		mount('<input type="text" />');
		expect(
			allowsNativeMenu({ target: query("input"), selection: null }),
		).toBe(true);
	});

	it("allows it on a textarea", () => {
		mount("<textarea></textarea>");
		expect(
			allowsNativeMenu({ target: query("textarea"), selection: null }),
		).toBe(true);
	});

	it("allows it inside a contenteditable element", () => {
		mount('<div contenteditable="true"><p><b>bold</b></p></div>');
		expect(allowsNativeMenu({ target: query("b"), selection: null })).toBe(
			true,
		);
	});

	it("allows it on text inside a contenteditable element", () => {
		mount('<div contenteditable><p id="line">words</p></div>');
		const text = query("#line").firstChild;
		expect(allowsNativeMenu({ target: text, selection: null })).toBe(true);
	});

	it("allows it on selected text that contains the target", () => {
		mount('<p id="about">Hi <span id="word">there</span></p>');
		const selection = select(query("#about"));
		expect(allowsNativeMenu({ target: query("#word"), selection })).toBe(
			true,
		);
	});

	it("allows it on the element whose text holds the selected word", () => {
		mount('<p id="about">Hi there</p>');
		const selection = selectWord({
			text: query("#about").firstChild,
			word: "there",
		});
		expect(allowsNativeMenu({ target: query("#about"), selection })).toBe(
			true,
		);
	});

	it("blocks it on a container around the selected text", () => {
		mount('<section id="page"><p id="about">Hi there</p></section>');
		const selection = select(query("#about"));
		expect(allowsNativeMenu({ target: query("#page"), selection })).toBe(
			false,
		);
	});

	it("allows it on a container when the menu opens at the start of the selected text", () => {
		const { menu, text, selection } = selectWordInMenu();
		placeCaret({ node: text, offset: SELECTED_WORD_START });
		expect(
			allowsNativeMenu({ target: menu, selection, point: MENU_POINT }),
		).toBe(true);
	});

	it("allows it on a container when the menu opens at the end of the selected text", () => {
		const { menu, text, selection } = selectWordInMenu();
		placeCaret({ node: text, offset: SELECTED_WORD_END });
		expect(
			allowsNativeMenu({ target: menu, selection, point: MENU_POINT }),
		).toBe(true);
	});

	it("blocks it on a container when the menu opens before the selected text", () => {
		const { menu, text, selection } = selectWordInMenu();
		placeCaret({ node: text, offset: SELECTED_WORD_START - 1 });
		expect(
			allowsNativeMenu({ target: menu, selection, point: MENU_POINT }),
		).toBe(false);
	});

	it("blocks it on a container when the menu opens past the selected text", () => {
		const { menu, text, selection } = selectWordInMenu();
		placeCaret({ node: text, offset: SELECTED_WORD_END + 1 });
		expect(
			allowsNativeMenu({ target: menu, selection, point: MENU_POINT }),
		).toBe(false);
	});

	it("blocks it on a container when the browser can't find the caret at a point", () => {
		const { menu, selection } = selectWordInMenu();
		expect(
			allowsNativeMenu({ target: menu, selection, point: MENU_POINT }),
		).toBe(false);
	});

	it("blocks it on a container when the caret lands in a text field", () => {
		const { menu, selection } = selectWordInMenu();
		const field = document.createElement("input");
		field.value = "typed text";
		menu.append(field);
		placeCaret({ node: menu, offset: menu.childNodes.length });
		Object.defineProperty(document, "caretPositionFromPoint", {
			configurable: true,
			value: () => ({ offsetNode: field, offset: field.value.length }),
		});
		expect(
			allowsNativeMenu({ target: menu, selection, point: MENU_POINT }),
		).toBe(false);
	});

	it("blocks it on a plain element", () => {
		mount('<a href="/profile/1"><img alt="Photo" /></a>');
		expect(
			allowsNativeMenu({ target: query("img"), selection: null }),
		).toBe(false);
	});

	it("blocks it on an element outside the selected text", () => {
		mount('<p id="about">Hi there</p><a id="link" href="/">Link</a>');
		const selection = select(query("#about"));
		expect(allowsNativeMenu({ target: query("#link"), selection })).toBe(
			false,
		);
	});

	it("blocks it when the selection is collapsed", () => {
		mount('<p id="about">Hi there</p>');
		const selection = window.getSelection();
		selection?.collapse(query("#about"), 0);
		expect(allowsNativeMenu({ target: query("#about"), selection })).toBe(
			false,
		);
	});

	it("blocks it on a checkbox", () => {
		mount('<input type="checkbox" />');
		expect(
			allowsNativeMenu({ target: query("input"), selection: null }),
		).toBe(false);
	});

	it("blocks it inside a contenteditable=false island", () => {
		mount(
			'<div contenteditable="true"><span contenteditable="false"><i>chip</i></span></div>',
		);
		expect(allowsNativeMenu({ target: query("i"), selection: null })).toBe(
			false,
		);
	});

	it("blocks it on a target that is not a node", () => {
		expect(allowsNativeMenu({ target: window, selection: null })).toBe(
			false,
		);
	});
});

describe("blockNativeMenu", () => {
	let release = () => {};

	beforeEach(() => {
		release = blockNativeMenu();
	});

	afterEach(() => {
		release();
	});

	it("cancels the context menu on a plain element", () => {
		mount('<a href="/profile/1">Profile</a>');
		expect(contextMenuOn(query("a")).defaultPrevented).toBe(true);
	});

	it("leaves the context menu of a text field alone", () => {
		mount("<textarea></textarea>");
		expect(contextMenuOn(query("textarea")).defaultPrevented).toBe(false);
	});

	it("lets the target's own handlers see the event before cancelling it", () => {
		mount('<div id="row">Row</div>');
		let cancelledBeforeRow: boolean | null = null;
		query("#row").addEventListener("contextmenu", (event) => {
			cancelledBeforeRow = event.defaultPrevented;
		});
		const event = contextMenuOn(query("#row"));
		expect(cancelledBeforeRow).toBe(false);
		expect(event.defaultPrevented).toBe(true);
	});

	it("leaves alone the selection menu Android reopens on the focused dialog", () => {
		const { menu, text } = selectWordInMenu();
		placeCaret({ node: text, offset: SELECTED_WORD_START });
		expect(reopenedSelectionMenuOn(menu).defaultPrevented).toBe(false);
	});

	it("stops cancelling once released", () => {
		mount('<a href="/profile/1">Profile</a>');
		release();
		expect(contextMenuOn(query("a")).defaultPrevented).toBe(false);
	});
});

describe("blockNativeMenu haptics", () => {
	let release = () => {};

	beforeEach(() => {
		playHapticMock.mockReset();
		release = blockNativeMenu();
	});

	afterEach(() => {
		release();
	});

	it("taps when a touch long press opens a text field's own menu", () => {
		mount("<textarea></textarea>");
		contextMenuOn(query("textarea"), { pointerType: "touch" });
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("taps when a touch long press opens the menu of selected text", () => {
		mount("<p>Some <b>selected</b> words</p>");
		select(query("b"));
		contextMenuOn(query("b"), {
			sourceCapabilities: { firesTouchEvents: true },
		});
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("longPress");
	});

	it("stays quiet for a right-click on a text field", () => {
		mount("<textarea></textarea>");
		contextMenuOn(query("textarea"), { pointerType: "mouse" });
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when a touch long press on a plain element is blocked", () => {
		mount('<a href="/profile/1">Profile</a>');
		contextMenuOn(query("a"), { pointerType: "touch" });
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("leaves the tap to a handler that already took the event", () => {
		mount("<textarea></textarea>");
		query("textarea").addEventListener("contextmenu", (event) =>
			event.preventDefault(),
		);
		contextMenuOn(query("textarea"), { pointerType: "touch" });
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});
