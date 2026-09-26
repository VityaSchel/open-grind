import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	allowsNativeMenu,
	blockNativeMenu,
} from "$lib/platform/block-native-menu";

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

function contextMenuOn(target: Element): MouseEvent {
	const event = new MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		button: 2,
	});
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	window.getSelection()?.removeAllRanges();
	document.body.innerHTML = "";
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

	it("stops cancelling once released", () => {
		mount('<a href="/profile/1">Profile</a>');
		release();
		expect(contextMenuOn(query("a")).defaultPrevented).toBe(false);
	});
});
