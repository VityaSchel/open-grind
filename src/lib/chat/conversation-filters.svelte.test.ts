import { describe, expect, it } from "vitest";

import { defaultConversationFilters } from "$lib/model/messaging/conversation-filters";
import { SexualPosition } from "$lib/model/users/profiles";
import {
	ConversationFilters,
	inboxFilterRequest,
} from "./conversation-filters.svelte";

const UNFILTERED = {
	unreadOnly: false,
	chemistryOnly: false,
	favoritesOnly: false,
	rightNowOnly: false,
	onlineNowOnly: false,
	distanceMeters: null,
	positions: [],
};

describe("ConversationFilters", () => {
	it("starts unfiltered", () => {
		const filters = new ConversationFilters();

		expect(filters.value).toEqual(defaultConversationFilters);
		expect(filters.filtered).toBe(false);
		expect(filters.request).toBeNull();
	});

	it("reports whether set() changed the active filters", () => {
		const filters = new ConversationFilters();

		expect(filters.set({ favorites: true })).toBe(true);
		expect(filters.set({ favorites: true })).toBe(false);
		expect(filters.set({ distanceMetres: 5000 })).toBe(true);
		expect(filters.set({ distanceMetres: 5000 })).toBe(false);
		expect(filters.set(defaultConversationFilters)).toBe(true);
		expect(filters.set(defaultConversationFilters)).toBe(false);
	});

	it("compares positions by value", () => {
		const filters = new ConversationFilters();

		expect(filters.set({ positions: [SexualPosition.Top] })).toBe(true);
		expect(filters.set({ positions: [SexualPosition.Top] })).toBe(false);
		expect(filters.set({ positions: [SexualPosition.Bottom] })).toBe(true);
	});

	it("keeps untouched filters when set() is given one field", () => {
		const filters = new ConversationFilters();

		filters.set({ favorites: true });
		filters.set({ unread: true });

		expect(filters.value.favorites).toBe(true);
		expect(filters.request).toEqual({
			...UNFILTERED,
			favoritesOnly: true,
			unreadOnly: true,
		});
	});
});

describe("inboxFilterRequest", () => {
	it("sends no body while nothing is active", () => {
		expect(inboxFilterRequest(defaultConversationFilters)).toBeNull();
	});

	it("maps every filter onto the request body", () => {
		expect(
			inboxFilterRequest({
				favorites: true,
				unread: true,
				online: true,
				rightNow: true,
				distanceMetres: 8046.72,
				positions: [SexualPosition.Top, SexualPosition.Versatile],
			}),
		).toEqual({
			unreadOnly: true,
			chemistryOnly: false,
			favoritesOnly: true,
			rightNowOnly: true,
			onlineNowOnly: true,
			distanceMeters: 8046.72,
			positions: [SexualPosition.Top, SexualPosition.Versatile],
		});
	});

	it("asks the server for favorites only", () => {
		expect(
			inboxFilterRequest({
				...defaultConversationFilters,
				favorites: true,
			}),
		).toEqual({ ...UNFILTERED, favoritesOnly: true });
	});

	it("sends a body once a distance or a position is set", () => {
		expect(
			inboxFilterRequest({
				...defaultConversationFilters,
				distanceMetres: 1000,
			}),
		).toEqual({ ...UNFILTERED, distanceMeters: 1000 });
		expect(
			inboxFilterRequest({
				...defaultConversationFilters,
				positions: [SexualPosition.Side],
			}),
		).toEqual({ ...UNFILTERED, positions: [SexualPosition.Side] });
	});
});
