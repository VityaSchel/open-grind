import { describe, expect, it } from "vitest";

import { SelectionSet } from "./selection.svelte";

describe("SelectionSet.toggleExclusive", () => {
	it("selects the item alone", () => {
		const selection = new SelectionSet<number>();
		selection.toggleExclusive(1);
		expect(selection.values()).toEqual([1]);
	});

	it("moves the selection to another item", () => {
		const selection = new SelectionSet<number>();
		selection.toggleExclusive(1);
		selection.toggleExclusive(2);
		expect(selection.values()).toEqual([2]);
	});

	it("deselects the item when it is already selected", () => {
		const selection = new SelectionSet<number>();
		selection.toggleExclusive(1);
		selection.toggleExclusive(1);
		expect(selection.size).toBe(0);
	});

	it("replaces a selection that was already at its maximum", () => {
		const selection = new SelectionSet<number>(1);
		selection.add(1);
		selection.toggleExclusive(2);
		expect(selection.values()).toEqual([2]);
	});
});
