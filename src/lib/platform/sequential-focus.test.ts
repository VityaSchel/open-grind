import { describe, expect, it } from "vitest";

import { keepOutOfSequentialFocus } from "./sequential-focus";

describe("keepOutOfSequentialFocus", () => {
	it("takes a listening element out of the Tab order until released", () => {
		const element = document.createElement("div");

		const release = keepOutOfSequentialFocus(element);

		expect(element.getAttribute("tabindex")).toBe("-1");
		release();
		expect(element.hasAttribute("tabindex")).toBe(false);
	});

	it("leaves an element's own tabindex alone", () => {
		const element = document.createElement("div");
		element.setAttribute("tabindex", "0");

		keepOutOfSequentialFocus(element)();

		expect(element.getAttribute("tabindex")).toBe("0");
	});
});
