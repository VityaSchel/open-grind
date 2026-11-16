import { afterEach, describe, expect, it, vi } from "vitest";

import { revealKeyboardFocus } from "./reveal-keyboard-focus";

const releases: (() => void)[] = [];

afterEach(() => {
	for (const release of releases.splice(0)) release();
	document.body.replaceChildren();
});

function focusable({
	tag,
	keyboardFocus,
}: {
	tag: string;
	keyboardFocus: boolean;
}) {
	const element = document.createElement(tag);
	document.body.append(element);
	const matches = element.matches.bind(element);
	vi.spyOn(element, "matches").mockImplementation((selector) =>
		selector === ":focus-visible" ? keyboardFocus : matches(selector),
	);
	const scrollIntoView = vi.fn();
	element.scrollIntoView = scrollIntoView;
	return { element, scrollIntoView };
}

function startRevealing() {
	releases.push(revealKeyboardFocus());
}

describe("revealKeyboardFocus", () => {
	it("scrolls a control focused from the keyboard fully into view", () => {
		startRevealing();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: true,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
			block: "nearest",
			inline: "nearest",
		});
	});

	it("leaves focus from a pointer where the browser put it", () => {
		startRevealing();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: false,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("leaves text fields to the browser and the soft keyboard", () => {
		startRevealing();
		const fields = [
			focusable({ tag: "input", keyboardFocus: true }),
			focusable({ tag: "textarea", keyboardFocus: true }),
		];

		for (const { element } of fields)
			element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		for (const { scrollIntoView } of fields)
			expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("stops revealing once released", () => {
		revealKeyboardFocus()();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: true,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).not.toHaveBeenCalled();
	});
});
