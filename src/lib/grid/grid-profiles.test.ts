import { describe, expect, it } from "vitest";

import type { LazyGridProfile } from "./grid";
import {
	browseOrder,
	dedupeGridProfiles,
	indexProfilesById,
} from "./grid-profiles";
import { rendered } from "./grid-test-helpers";

function lazy(id: number): LazyGridProfile {
	return { type: "lazy", id, unread: null, isVisiting: false };
}

describe("dedupeGridProfiles", () => {
	it("keeps the first occurrence of a rendered profile in place", () => {
		const first = { ...rendered({ id: 2 }), displayName: "First" };
		const profiles = dedupeGridProfiles([
			rendered({ id: 1 }),
			first,
			rendered({ id: 3 }),
			{ ...rendered({ id: 2 }), displayName: "Second" },
		]);

		expect(profiles).toEqual([
			rendered({ id: 1 }),
			first,
			rendered({ id: 3 }),
		]);
	});

	it("lets a rendered row replace a lazy one at the lazy row's position", () => {
		const profiles = dedupeGridProfiles([
			lazy(1),
			rendered({ id: 2 }),
			rendered({ id: 1 }),
		]);

		expect(profiles).toEqual([rendered({ id: 1 }), rendered({ id: 2 })]);
	});

	it("never lets a lazy row replace a rendered one", () => {
		const profiles = dedupeGridProfiles([
			rendered({ id: 1 }),
			rendered({ id: 2 }),
			lazy(1),
		]);

		expect(profiles).toEqual([rendered({ id: 1 }), rendered({ id: 2 })]);
	});
});

describe("indexProfilesById", () => {
	it("maps each id to its position", () => {
		const index = indexProfilesById([
			rendered({ id: 7 }),
			lazy(3),
			rendered({ id: 5 }),
		]);

		expect([...index]).toEqual([
			[7, 0],
			[3, 1],
			[5, 2],
		]);
	});
});

describe("browseOrder", () => {
	it("orders only rendered rows, skipping lazy rows and our own profile", () => {
		const { order, rows, entryIndex } = browseOrder({
			profiles: [
				rendered({ id: 1 }),
				lazy(2),
				rendered({ id: 3 }),
				rendered({ id: 4 }),
				rendered({ id: 5 }),
			],
			entryId: 4,
			excludeId: 3,
		});

		expect(order).toEqual([1, 4, 5]);
		expect(entryIndex).toBe(1);
		expect([...rows.keys()]).toEqual([1, 4, 5]);
		expect(rows.get(4)).toEqual(rendered({ id: 4 }));
	});

	it("gives a single stop when the entry is not in the grid", () => {
		expect(
			browseOrder({
				profiles: [rendered({ id: 1 }), rendered({ id: 2 })],
				entryId: 9,
				excludeId: 100,
			}),
		).toEqual({ order: [9], rows: new Map(), entryIndex: 0 });
	});

	it("gives a single stop when the entry is only a lazy row", () => {
		expect(
			browseOrder({
				profiles: [rendered({ id: 1 }), lazy(2), rendered({ id: 3 })],
				entryId: 2,
				excludeId: 100,
			}),
		).toEqual({ order: [2], rows: new Map(), entryIndex: 0 });
	});

	it("never repeats an id", () => {
		const { order, entryIndex } = browseOrder({
			profiles: [
				rendered({ id: 1 }),
				rendered({ id: 2 }),
				rendered({ id: 1 }),
				rendered({ id: 3 }),
			],
			entryId: 3,
			excludeId: 100,
		});

		expect(order).toEqual([1, 2, 3]);
		expect(entryIndex).toBe(2);
	});
});
