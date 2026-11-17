import { describe, expect, it } from "vitest";

import { makeScrollable } from "./pull-test-helpers";
import { chainAllowsPull, chainRestsAt } from "./scroll-chain";

const NO_PULL = "data-refresh-no-pull";

describe("chainAllowsPull", () => {
	it("allows when no intermediate scroller can consume the pull", () => {
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(
			true,
		);
		root.remove();
	});

	it("refuses when a nested scroller is scrolled away from the boundary", () => {
		const root = document.createElement("div");
		const nested = document.createElement("div");
		const leaf = document.createElement("span");
		nested.appendChild(leaf);
		root.appendChild(nested);
		document.body.appendChild(root);
		makeScrollable(nested, { scrollTop: 50 });
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(
			false,
		);
		nested.scrollTop = 0;
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(
			true,
		);
		expect(chainAllowsPull({ start: leaf, root, position: "bottom" })).toBe(
			false,
		);
		nested.scrollTop = 399;
		expect(chainAllowsPull({ start: leaf, root, position: "bottom" })).toBe(
			true,
		);
		root.remove();
	});

	it("refuses targets outside the root", () => {
		const root = document.createElement("div");
		const stranger = document.createElement("div");
		document.body.append(root, stranger);
		expect(
			chainAllowsPull({ start: stranger, root, position: "top" }),
		).toBe(false);
		root.remove();
		stranger.remove();
	});

	it("refuses while the root is scroll-locked", () => {
		const root = document.createElement("div");
		const leaf = document.createElement("span");
		root.appendChild(leaf);
		document.body.appendChild(root);
		makeScrollable(root);
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(
			true,
		);
		root.style.overflowY = "hidden";
		expect(chainAllowsPull({ start: leaf, root, position: "top" })).toBe(
			false,
		);
		root.remove();
	});

	it("refuses document pulls while the body is scroll-locked", () => {
		const leaf = document.createElement("span");
		document.body.appendChild(leaf);
		expect(
			chainAllowsPull({
				start: leaf,
				root: document.documentElement,
				position: "top",
			}),
		).toBe(true);
		document.body.style.overflow = "hidden";
		expect(
			chainAllowsPull({
				start: leaf,
				root: document.documentElement,
				position: "top",
			}),
		).toBe(false);
		document.body.style.overflow = "";
		leaf.remove();
	});
});

describe("chainAllowsPull from a no-pull area", () => {
	function tree() {
		const outside = document.createElement("section");
		const root = document.createElement("div");
		const area = document.createElement("div");
		const photo = document.createElement("img");
		const row = document.createElement("p");
		area.append(photo);
		root.append(area, row);
		outside.append(root);
		document.body.append(outside);
		return { outside, root, area, photo, row };
	}

	it("refuses a pull that starts inside a marked area only when no-pull areas are honored", () => {
		const { outside, root, area, photo } = tree();
		area.setAttribute(NO_PULL, "");

		expect(
			chainAllowsPull({
				start: photo,
				root,
				position: "top",
				honorNoPull: true,
			}),
		).toBe(false);
		expect(
			chainAllowsPull({
				start: area,
				root,
				position: "top",
				honorNoPull: true,
			}),
		).toBe(false);
		expect(chainAllowsPull({ start: photo, root, position: "top" })).toBe(
			true,
		);
		outside.remove();
	});

	it("still pulls from outside the marked area", () => {
		const { outside, root, area, row } = tree();
		area.setAttribute(NO_PULL, "");

		expect(
			chainAllowsPull({
				start: row,
				root,
				position: "top",
				honorNoPull: true,
			}),
		).toBe(true);
		outside.remove();
	});

	it("ignores a marker on the root or above it", () => {
		const { outside, root, photo } = tree();
		root.setAttribute(NO_PULL, "");
		outside.setAttribute(NO_PULL, "");

		expect(
			chainAllowsPull({
				start: photo,
				root,
				position: "top",
				honorNoPull: true,
			}),
		).toBe(true);
		expect(
			chainAllowsPull({
				start: root,
				root,
				position: "top",
				honorNoPull: true,
			}),
		).toBe(true);
		outside.remove();
	});
});

describe("chainRestsAt", () => {
	function nest() {
		const page = document.createElement("div");
		const carousel = document.createElement("div");
		const photo = document.createElement("img");
		carousel.append(photo);
		page.append(carousel);
		document.body.append(page);
		makeScrollable(page);
		makeScrollable(carousel);
		return { page, carousel, photo };
	}

	it("rests at the top while every scroller around the start is at its top", () => {
		const { page, photo } = nest();

		expect(chainRestsAt({ start: photo, position: "top" })).toBe(true);
		page.remove();
	});

	it.each(["page", "carousel"] as const)(
		"does not rest at the top while the %s can still scroll up",
		(scrolled) => {
			const scrollers = nest();
			scrollers[scrolled].scrollTop = 40;

			expect(
				chainRestsAt({ start: scrollers.photo, position: "top" }),
			).toBe(false);
			scrollers.page.remove();
		},
	);

	it("rests at the bottom only once every scroller around the start reached its floor", () => {
		const { page, carousel, photo } = nest();

		expect(chainRestsAt({ start: photo, position: "bottom" })).toBe(false);
		page.scrollTop = 400;
		carousel.scrollTop = 400;
		expect(chainRestsAt({ start: photo, position: "bottom" })).toBe(true);
		page.remove();
	});
});
