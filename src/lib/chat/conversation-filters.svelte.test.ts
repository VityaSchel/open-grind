import { describe, expect, it } from "vitest";

import {
	ConversationFilters,
	inboxFilterRequest,
} from "./conversation-filters.svelte";

describe("ConversationFilters", () => {
	it("starts with nothing active", () => {
		expect(new ConversationFilters().active).toEqual([]);
	});

	it("reports whether set() changed the active filters", () => {
		const filters = new ConversationFilters();

		expect(filters.set(["favorites"])).toBe(true);
		expect(filters.set(["favorites"])).toBe(false);
		expect(filters.set([])).toBe(true);
		expect(filters.set([])).toBe(false);
	});
});

describe("inboxFilterRequest", () => {
	it("sends no body while nothing is active", () => {
		expect(inboxFilterRequest([])).toBeNull();
	});

	it("asks the server for favorites only", () => {
		expect(inboxFilterRequest(["favorites"])).toEqual({
			unreadOnly: false,
			chemistryOnly: false,
			favoritesOnly: true,
			rightNowOnly: false,
			onlineNowOnly: false,
			distanceMeters: null,
			positions: [],
		});
	});
});
