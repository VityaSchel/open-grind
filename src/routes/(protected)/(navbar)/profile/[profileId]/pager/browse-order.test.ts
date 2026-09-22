import { describe, expect, it } from "vitest";

import { rendered } from "$lib/grid/grid-test-helpers";
import type { LazyGridProfile } from "$lib/grid/grid";
import { browseOrder } from "./browse-order";

function lazy(id: number): LazyGridProfile {
	return { type: "lazy", id, unread: null, isVisiting: false };
}

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
