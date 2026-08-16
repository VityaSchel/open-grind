import { describe, expect, it } from "vitest";

import { ConversationFilters } from "./conversation-filters.svelte";
import { conversation } from "./conversations-test-helpers";

const plain = conversation("a:1", 1000);
const favorited = conversation("b:2", 1000, { favorite: true });

describe("ConversationFilters", () => {
	it("passes everything through while no filter is on", () => {
		const filters = new ConversationFilters();

		expect(filters.active).toEqual([]);
		expect(filters.matches(plain)).toBe(true);
		expect(filters.matches(favorited)).toBe(true);
	});

	it("keeps only favorites once the favorites filter is on", () => {
		const filters = new ConversationFilters();
		filters.active = ["favorites"];

		expect(filters.matches(plain)).toBe(false);
		expect(filters.matches(favorited)).toBe(true);
	});

	it("passes everything through again once the filter is cleared", () => {
		const filters = new ConversationFilters();
		filters.active = ["favorites"];
		filters.active = [];

		expect(filters.matches(plain)).toBe(true);
	});

	it("reports whether set() changed the active filters", () => {
		const filters = new ConversationFilters();

		expect(filters.set(["favorites"])).toBe(true);
		expect(filters.set(["favorites"])).toBe(false);
		expect(filters.set([])).toBe(true);
		expect(filters.set([])).toBe(false);
	});
});
