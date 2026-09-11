import { describe, expect, it } from "vitest";

import { moveItem, nearestSlot, previewSlot } from "./reorder";

const items = ["a", "b", "c", "d", "e"];

describe("moveItem", () => {
	it("carries an item forward, closing the gap behind it", () => {
		expect(moveItem({ items, from: 1, to: 3 })).toEqual([
			"a",
			"c",
			"d",
			"b",
			"e",
		]);
	});

	it("carries an item backward, pushing the rest along", () => {
		expect(moveItem({ items, from: 3, to: 1 })).toEqual([
			"a",
			"d",
			"b",
			"c",
			"e",
		]);
	});

	it("returns the same array when nothing moves", () => {
		expect(moveItem({ items, from: 2, to: 2 })).toBe(items);
		expect(moveItem({ items, from: -1, to: 2 })).toBe(items);
		expect(moveItem({ items, from: 9, to: 2 })).toBe(items);
	});

	it("clamps a target past either end", () => {
		expect(moveItem({ items, from: 0, to: 99 })).toEqual([
			"b",
			"c",
			"d",
			"e",
			"a",
		]);
		expect(moveItem({ items, from: 4, to: -3 })).toEqual([
			"e",
			"a",
			"b",
			"c",
			"d",
		]);
	});

	it("leaves the input untouched", () => {
		const original = [...items];
		moveItem({ items, from: 0, to: 4 });
		expect(items).toEqual(original);
	});
});

describe("previewSlot", () => {
	it("puts the held cell on its target", () => {
		expect(previewSlot({ index: 1, from: 1, to: 3 })).toBe(3);
	});

	it("shifts the cells the held one passes forward", () => {
		const slots = items.map((_, index) =>
			previewSlot({ index, from: 1, to: 3 }),
		);
		expect(slots).toEqual([0, 3, 1, 2, 4]);
	});

	it("shifts the cells the held one passes backward", () => {
		const slots = items.map((_, index) =>
			previewSlot({ index, from: 3, to: 1 }),
		);
		expect(slots).toEqual([0, 2, 3, 1, 4]);
	});

	it("agrees with the committed order", () => {
		for (const from of [0, 2, 4]) {
			for (const to of [0, 1, 3, 4]) {
				const committed = moveItem({ items, from, to });
				items.forEach((item, index) => {
					const slot = previewSlot({ index, from, to });
					expect(committed[slot], `${item} ${from}->${to}`).toBe(
						item,
					);
				});
			}
		}
	});
});

describe("nearestSlot", () => {
	const centers = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 0, y: 100 },
	];

	it("picks the closest centre", () => {
		expect(nearestSlot({ centers, x: 90, y: 10 })).toBe(1);
		expect(nearestSlot({ centers, x: 10, y: 80 })).toBe(2);
	});

	it("keeps the first on a tie", () => {
		expect(nearestSlot({ centers, x: 50, y: 0 })).toBe(0);
	});
});
