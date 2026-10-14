import { afterEach, describe, expect, it } from "vitest";

import {
	buttonHolding,
	buttonNamedBy,
	type ClipContext,
	countLines,
	cutsText,
	OVERLAY_KINDS,
	OVERLAY_SELECTOR,
	overlayKind,
} from "./screenshot-labels";

const LINE_HEIGHT = 17;
const CARD = { x: 10, y: 10, width: 160, height: 60 };

function mount(html: string): void {
	document.body.innerHTML = html;
}

function byId(id: string): Element {
	const element = document.getElementById(id);
	if (element === null) throw new Error(`No #${id}`);
	return element;
}

function rect({
	x = 0,
	y,
	width = 40,
	height = LINE_HEIGHT,
}: {
	x?: number;
	y: number;
	width?: number;
	height?: number;
}) {
	return { x, y, width, height };
}

function context(overrides: Partial<ClipContext>): ClipContext {
	return {
		overflowX: "hidden",
		overflowY: "hidden",
		ellipsis: false,
		lineClamp: false,
		scrollWidth: CARD.width,
		clientWidth: CARD.width,
		scrollHeight: CARD.height,
		clientHeight: CARD.height,
		paddingBox: CARD,
		...overrides,
	};
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("buttons", () => {
	it("holds the text of a button", () => {
		mount('<button id="button"><span id="text">Save</span></button>');
		expect(buttonHolding(byId("text"))).toBe(byId("button"));
	});

	it("is named by the aria-label of an icon button", () => {
		mount('<button id="button" aria-label="Close"><svg></svg></button>');
		expect(buttonNamedBy({ element: byId("button"), source: "name" })).toBe(
			byId("button"),
		);
	});

	it("holds the text of an element with role=button", () => {
		mount('<div id="button" role="button"><b id="text">Edit</b></div>');
		expect(buttonHolding(byId("text"))).toBe(byId("button"));
	});

	it("is named by the value of a submit input", () => {
		mount('<input id="submit" type="submit" value="Send">');
		expect(
			buttonNamedBy({ element: byId("submit"), source: "value" }),
		).toBe(byId("submit"));
	});

	it("leaves out text and attributes that name no button", () => {
		mount(`
			<p id="text">Plain</p>
			<img id="photo" alt="Photo">
			<div id="labelled" aria-label="Region"></div>
			<button id="described" aria-description="Opens the menu">Menu</button>
			<input id="field" value="Typed">
		`);
		expect(buttonHolding(byId("text"))).toBeNull();
		expect(
			buttonNamedBy({ element: byId("photo"), source: "attribute" }),
		).toBeNull();
		expect(
			buttonNamedBy({ element: byId("labelled"), source: "name" }),
		).toBeNull();
		expect(
			buttonNamedBy({ element: byId("described"), source: "attribute" }),
		).toBeNull();
		expect(
			buttonNamedBy({ element: byId("field"), source: "value" }),
		).toBeNull();
	});
});

describe("overlays", () => {
	const POPOVER_OPEN = ":popover-open";

	function kindOf(id: string) {
		const element = byId(id);
		return overlayKind(
			(selector) =>
				selector !== POPOVER_OPEN && element.matches(selector),
		);
	}

	it("tells a toast from the sheet it shows over", () => {
		mount(`
			<div id="sheet" role="dialog" data-vaul-drawer>
				<ol><li id="toast" data-sonner-toast></li></ol>
			</div>
		`);
		expect(kindOf("sheet")).toBe("sheet");
		expect(kindOf("toast")).toBe("toast");
	});

	it("names the kind of each overlay", () => {
		mount(`
			<dialog id="dialog" open></dialog>
			<div id="role-dialog" role="dialog"></div>
			<div id="alert" role="alertdialog"></div>
			<div id="menu" role="menu"></div>
			<div id="listbox" role="listbox"></div>
			<div id="tooltip" role="tooltip"></div>
			<div id="page"></div>
		`);
		expect(
			Object.fromEntries(
				[
					"dialog",
					"role-dialog",
					"alert",
					"menu",
					"listbox",
					"tooltip",
					"page",
				].map((id) => [id, kindOf(id)]),
			),
		).toEqual({
			dialog: "dialog",
			"role-dialog": "dialog",
			alert: "dialog",
			menu: "menu",
			listbox: "menu",
			tooltip: "popover",
			page: undefined,
		});
		expect(overlayKind((selector) => selector === POPOVER_OPEN)).toBe(
			"popover",
		);
	});

	it("maps every overlay selector to one kind", () => {
		expect(OVERLAY_SELECTOR.split(", ")).toEqual(
			OVERLAY_KINDS.map(({ selector }) => selector),
		);
		expect(new Set(OVERLAY_KINDS.map(({ kind }) => kind))).toEqual(
			new Set(["toast", "sheet", "menu", "dialog", "popover"]),
		);
	});
});

describe("countLines", () => {
	it("counts a wrapped paragraph as two lines", () => {
		expect(
			countLines([
				rect({ y: 0, width: 160 }),
				rect({ y: 20, width: 90 }),
			]),
		).toBe(2);
	});

	it("keeps a single line with bold text on one line", () => {
		expect(
			countLines([
				rect({ x: 0, y: 3 }),
				rect({ x: 40, y: 0, height: 23 }),
				rect({ x: 80, y: 3 }),
			]),
		).toBe(1);
	});

	it("splits lines set tighter than their glyphs", () => {
		expect(countLines([rect({ y: 0 }), rect({ y: 14 })])).toBe(2);
	});

	it("ignores rects without width", () => {
		expect(countLines([rect({ y: 0 }), rect({ y: 20, width: 0 })])).toBe(1);
	});
});

describe("cutsText", () => {
	const inside = [rect({ x: 20, y: 20 })];
	const lineHeight = LINE_HEIGHT;

	it("cuts text that ends in an ellipsis", () => {
		expect(
			cutsText({
				context: context({ ellipsis: true, scrollWidth: 240 }),
				rects: [rect({ x: 10, y: 20, width: 150 })],
				lineHeight,
			}),
		).toBe(true);
	});

	it("cuts text clamped to fewer lines", () => {
		expect(
			cutsText({
				context: context({ lineClamp: true, scrollHeight: 85 }),
				rects: inside,
				lineHeight,
			}),
		).toBe(true);
	});

	it("leaves an ellipsis that fits within 1 px", () => {
		expect(
			cutsText({
				context: context({
					ellipsis: true,
					scrollWidth: CARD.width + 1,
				}),
				rects: inside,
				lineHeight,
			}),
		).toBe(false);
	});

	it("leaves an ellipsis box that overflows only in height", () => {
		expect(
			cutsText({
				context: context({
					ellipsis: true,
					scrollHeight: CARD.height + 2,
				}),
				rects: inside,
				lineHeight,
			}),
		).toBe(false);
	});

	it("leaves a clamped box that overflows only in width", () => {
		expect(
			cutsText({
				context: context({
					lineClamp: true,
					scrollWidth: CARD.width + 40,
				}),
				rects: inside,
				lineHeight,
			}),
		).toBe(false);
	});

	it("leaves fitting text in a card an oversized image overflows", () => {
		expect(
			cutsText({
				context: context({ scrollWidth: 320, scrollHeight: 200 }),
				rects: inside,
				lineHeight,
			}),
		).toBe(false);
	});

	it("cuts text that runs past a hidden card's padding box", () => {
		expect(
			cutsText({
				context: context({}),
				rects: [rect({ x: 20, y: 20, width: 152 })],
				lineHeight,
			}),
		).toBe(true);
		expect(
			cutsText({
				context: context({}),
				rects: [rect({ x: 20, y: 20, width: 151 })],
				lineHeight,
			}),
		).toBe(false);
	});

	it("measures text set tighter than its glyphs by its line box", () => {
		const row = context({ paddingBox: { ...CARD, height: 14 } });
		const glyphs = rect({ x: 20, y: CARD.y - 2, height: 18 });
		expect(
			cutsText({ context: row, rects: [glyphs], lineHeight: 14 }),
		).toBe(false);
		expect(
			cutsText({ context: row, rects: [glyphs], lineHeight: 18 }),
		).toBe(true);
		expect(
			cutsText({
				context: row,
				rects: [{ ...glyphs, y: glyphs.y + 2 }],
				lineHeight: 14,
			}),
		).toBe(true);
	});

	it("leaves text cut at a scroller edge", () => {
		expect(
			cutsText({
				context: context({ overflowX: "auto" }),
				rects: [rect({ x: 20, y: 20, width: 400 })],
				lineHeight,
			}),
		).toBe(false);
	});

	it("cuts text on the hidden axis of a scroller", () => {
		const scroller = context({ overflowX: "hidden", overflowY: "auto" });
		expect(
			cutsText({
				context: scroller,
				rects: [rect({ x: 20, y: 20, width: 400 })],
				lineHeight,
			}),
		).toBe(true);
		expect(
			cutsText({
				context: scroller,
				rects: [rect({ x: 20, y: 400 })],
				lineHeight,
			}),
		).toBe(false);
	});

	it("checks only the axis that clips", () => {
		const clipX = context({ overflowX: "clip", overflowY: "visible" });
		expect(
			cutsText({
				context: clipX,
				rects: [rect({ x: 20, y: 60, height: 40 })],
				lineHeight: 40,
			}),
		).toBe(false);
		expect(
			cutsText({
				context: clipX,
				rects: [rect({ x: 150, y: 20 })],
				lineHeight,
			}),
		).toBe(true);
	});
});
