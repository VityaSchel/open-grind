import { describe, expect, it } from "vitest";

import { makeScrollable } from "./pull-test-helpers";
import { chainAllowsPull } from "./scroll-chain";

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
