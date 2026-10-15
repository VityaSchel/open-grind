// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { escapeMeansBack } from "./escape-back";

function pressEscape({
	on = document.body,
	takenEarlier = false,
}: { on?: Element; takenEarlier?: boolean } = {}): boolean {
	let meansBack = false;
	const listening = new AbortController();
	if (takenEarlier)
		document.addEventListener(
			"keydown",
			(event) => event.preventDefault(),
			{ signal: listening.signal },
		);
	window.addEventListener(
		"keydown",
		(event) => {
			meansBack = escapeMeansBack(event);
		},
		{ signal: listening.signal },
	);
	on.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Escape",
			code: "Escape",
			bubbles: true,
			cancelable: true,
		}),
	);
	listening.abort();
	return meansBack;
}

function mount(html: string): Element {
	document.body.insertAdjacentHTML("beforeend", html);
	return document.body.lastElementChild!;
}

describe("escapeMeansBack", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("takes a plain Escape on the page as Back", () => {
		expect(pressEscape()).toBe(true);
	});

	it("leaves an Escape that a menu or dialog already handled", () => {
		expect(pressEscape({ takenEarlier: true })).toBe(false);
	});

	it.each([
		["a dialog or the photo viewer", '<div role="dialog"></div>'],
		["an alert", '<div role="alertdialog"></div>'],
		["a native modal", "<dialog open></dialog>"],
	])("stays on the page while %s is open", (_, overlay) => {
		mount(overlay);

		expect(pressEscape()).toBe(false);
	});

	it("goes back past a closed native dialog", () => {
		mount("<dialog></dialog>");

		expect(pressEscape()).toBe(true);
	});

	it("leaves Escape pressed in the toast list to it", () => {
		const toasts = mount(
			"<section data-sonner-toaster><button></button></section>",
		);

		expect(pressEscape({ on: toasts.querySelector("button")! })).toBe(
			false,
		);
	});
});
