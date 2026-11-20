// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { inertWhileClosing } from "./inert-while-closing";

function settle(): Promise<void> {
	return new Promise((resolve) => queueMicrotask(resolve));
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("inertWhileClosing", () => {
	it("makes a menu inert from the moment it starts closing", async () => {
		const menu = document.createElement("div");
		menu.dataset.state = "open";
		document.body.append(menu);
		const stop = inertWhileClosing(menu);
		expect(menu.hasAttribute("inert")).toBe(false);

		menu.dataset.state = "closed";
		await settle();
		expect(menu.hasAttribute("inert")).toBe(true);

		menu.dataset.state = "open";
		await settle();
		expect(menu.hasAttribute("inert")).toBe(false);
		stop();
	});

	it("starts inert when it attaches to a menu that is already closing", () => {
		const menu = document.createElement("div");
		menu.dataset.state = "closed";
		const stop = inertWhileClosing(menu);
		expect(menu.hasAttribute("inert")).toBe(true);
		stop();
	});

	it("stops following the menu once released", async () => {
		const menu = document.createElement("div");
		menu.dataset.state = "open";
		const stop = inertWhileClosing(menu);
		stop();

		menu.dataset.state = "closed";
		await settle();
		expect(menu.hasAttribute("inert")).toBe(false);
	});
});
