import { afterEach, describe, expect, it } from "vitest";

import { keyboardPagingBlocked } from "$lib/util/keyboard-paging";

function arrow({ defaultPrevented = false } = {}): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key: "ArrowRight",
		cancelable: true,
	});
	if (defaultPrevented) event.preventDefault();
	return event;
}

function focusInside(markup: string) {
	document.body.innerHTML = markup;
	document.body.querySelector("button")?.focus();
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("keyboardPagingBlocked", () => {
	it("lets a plain arrow through", () => {
		expect(
			keyboardPagingBlocked({ event: arrow(), lightboxBusy: false }),
		).toBe(false);
	});

	it("yields to whoever already handled the key", () => {
		expect(
			keyboardPagingBlocked({
				event: arrow({ defaultPrevented: true }),
				lightboxBusy: false,
			}),
		).toBe(true);
	});

	it("yields while the photo lightbox is busy", () => {
		expect(
			keyboardPagingBlocked({ event: arrow(), lightboxBusy: true }),
		).toBe(true);
	});

	it("yields to an open modal even when focus is still on the body", () => {
		document.body.innerHTML =
			'<div role="alertdialog" aria-modal="true"><button>Ok</button></div>';

		expect(
			keyboardPagingBlocked({ event: arrow(), lightboxBusy: false }),
			"an alert dialog does not mark arrow keys handled",
		).toBe(true);
	});

	for (const role of [
		"dialog",
		"alertdialog",
		"menu",
		"listbox",
		"slider",
		"radiogroup",
		"tablist",
	])
		it(`yields to focus inside a ${role}`, () => {
			focusInside(`<div role="${role}"><button>focus me</button></div>`);

			expect(
				keyboardPagingBlocked({ event: arrow(), lightboxBusy: false }),
			).toBe(true);
		});

	it("still pages when focus sits on an ordinary button", () => {
		focusInside("<div><button>focus me</button></div>");

		expect(
			keyboardPagingBlocked({ event: arrow(), lightboxBusy: false }),
		).toBe(false);
	});
});
