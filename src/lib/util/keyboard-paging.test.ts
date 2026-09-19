import { afterEach, describe, expect, it } from "vitest";

import { arrowKeyAction } from "./keyboard-paging";

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

describe("arrowKeyAction", () => {
	it("pages on a plain arrow", () => {
		expect(arrowKeyAction({ event: arrow(), lightboxBusy: false })).toBe(
			"page",
		);
	});

	it("leaves a key alone that someone already handled", () => {
		expect(
			arrowKeyAction({
				event: arrow({ defaultPrevented: true }),
				lightboxBusy: true,
			}),
		).toBe("ignore");
	});

	it("swallows the arrow while the photo lightbox is busy, so the browser cannot scroll the pager behind it", () => {
		expect(arrowKeyAction({ event: arrow(), lightboxBusy: true })).toBe(
			"swallow",
		);
	});

	it("yields to an open modal even when focus is still on the body", () => {
		document.body.innerHTML =
			'<div role="alertdialog" aria-modal="true"><button>Ok</button></div>';

		expect(
			arrowKeyAction({ event: arrow(), lightboxBusy: false }),
			"an alert dialog does not mark arrow keys handled",
		).toBe("ignore");
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
				arrowKeyAction({ event: arrow(), lightboxBusy: false }),
			).toBe("ignore");
		});

	it("still pages when focus sits on an ordinary button", () => {
		focusInside("<div><button>focus me</button></div>");

		expect(arrowKeyAction({ event: arrow(), lightboxBusy: false })).toBe(
			"page",
		);
	});
});
