import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { markMessage } from "../i18n/markers";
import {
	laidOutAsSource,
	matchSourceLayout,
	recordSourceLayout,
	type RenderedElement,
	sameLayout,
} from "./screenshot-layout";

const BOX = { x: 10, y: 20, width: 120, height: 17 };

function rendered({
	name = "p",
	shift = 0,
}: {
	name?: string;
	shift?: number;
}): RenderedElement {
	return { name, box: { ...BOX, width: BOX.width + shift } };
}

function append(html: string): void {
	document.body.insertAdjacentHTML("beforeend", html);
}

beforeEach(() => {
	document.getAnimations = () => [];
	document.adoptedStyleSheets = [];
	CSSStyleSheet.prototype.replaceSync = () => undefined;
	document.body.innerHTML = `<p>${markMessage({ key: "fixture.title", message: "Title" })}</p><span>Plain</span>`;
});

afterEach(() => {
	matchSourceLayout();
	document.body.innerHTML = "";
});

describe("sameLayout", () => {
	it("matches boxes within 1 px", () => {
		expect(
			sameLayout({
				source: [rendered({})],
				marked: [rendered({ shift: 1 })],
			}),
		).toBe(true);
	});

	it("tells boxes more than 1 px apart", () => {
		expect(
			sameLayout({
				source: [rendered({})],
				marked: [rendered({ shift: 1.5 })],
			}),
		).toBe(false);
	});

	it("tells a different DOM", () => {
		expect(
			sameLayout({
				source: [rendered({})],
				marked: [rendered({ name: "span" })],
			}),
		).toBe(false);
		expect(
			sameLayout({
				source: [rendered({})],
				marked: [rendered({}), rendered({})],
			}),
		).toBe(false);
	});
});

describe("the source layout", () => {
	it("measures a view laid out as in the source language", () => {
		recordSourceLayout();
		expect(matchSourceLayout()).toBe(true);
		expect(laidOutAsSource()).toBe(true);
	});

	it("measures nothing without a source render", () => {
		expect(matchSourceLayout()).toBe(false);
		expect(laidOutAsSource()).toBe(false);
	});

	it("measures nothing when the language added text", () => {
		recordSourceLayout();
		append("<p>Added</p>");
		expect(matchSourceLayout()).toBe(false);
		expect(laidOutAsSource()).toBe(false);
	});

	it("ignores text that holds only markers or spaces", () => {
		recordSourceLayout();
		append(`<b>${markMessage({ key: "fixture.empty", message: " " })}</b>`);
		expect(matchSourceLayout()).toBe(true);
	});

	it("stops measuring once text the source render lacked shows", () => {
		recordSourceLayout();
		matchSourceLayout();
		append("<p>Scrolled into view</p>");
		expect(laidOutAsSource()).toBe(false);
	});

	it("forgets the last view when the next one starts", () => {
		recordSourceLayout();
		matchSourceLayout();
		recordSourceLayout();
		expect(laidOutAsSource()).toBe(false);
	});
});
