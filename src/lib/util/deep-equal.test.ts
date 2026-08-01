import { describe, expect, it } from "vitest";

import { deepEqual } from "$lib/util/deep-equal";

describe("primitives", () => {
	it("compares by value", () => {
		expect(deepEqual(1, 1)).toBe(true);
		expect(deepEqual("a", "a")).toBe(true);
		expect(deepEqual(true, true)).toBe(true);
		expect(deepEqual(1, 2)).toBe(false);
		expect(deepEqual(1, "1")).toBe(false);
	});

	it("treats NaN as equal to itself", () => {
		expect(deepEqual(NaN, NaN)).toBe(true);
		expect(deepEqual(NaN, 0)).toBe(false);
	});

	it("treats the two zeroes as equal", () => {
		expect(deepEqual(-0, 0)).toBe(true);
	});

	it("keeps null, undefined and empty objects apart", () => {
		expect(deepEqual(null, null)).toBe(true);
		expect(deepEqual(undefined, undefined)).toBe(true);
		expect(deepEqual(null, undefined)).toBe(false);
		expect(deepEqual(null, {})).toBe(false);
		expect(deepEqual(undefined, {})).toBe(false);
	});
});

describe("arrays", () => {
	it("compares element-wise in order", () => {
		expect(deepEqual([1, "a", null], [1, "a", null])).toBe(true);
		expect(deepEqual([1, 2], [2, 1])).toBe(false);
		expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
	});

	it("recurses into nested values", () => {
		expect(deepEqual([{ a: [1] }], [{ a: [1] }])).toBe(true);
		expect(deepEqual([{ a: [1] }], [{ a: [2] }])).toBe(false);
	});

	it("is never equal to a non-array", () => {
		expect(deepEqual([], {})).toBe(false);
		expect(deepEqual({ 0: 1, length: 1 }, [1])).toBe(false);
	});
});

describe("plain objects", () => {
	it("ignores key order", () => {
		expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
	});

	it("requires the same key set", () => {
		expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
		expect(deepEqual({ a: undefined }, {})).toBe(false);
		expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
	});

	it("recurses into values", () => {
		expect(
			deepEqual({ a: { b: [1, { c: null }] } }, { a: { b: [1, { c: null }] } }),
		).toBe(true);
		expect(
			deepEqual({ a: { b: [1, { c: null }] } }, { a: { b: [1, { c: 0 }] } }),
		).toBe(false);
	});
});

describe("dates", () => {
	it("compares by time", () => {
		expect(deepEqual(new Date(1000), new Date(1000))).toBe(true);
		expect(deepEqual(new Date(1000), new Date(1001))).toBe(false);
		expect(deepEqual(new Date(NaN), new Date(NaN))).toBe(true);
		expect(deepEqual(new Date(1000), 1000)).toBe(false);
	});
});

describe("values outside the JSON shape", () => {
	it("compares anything else by reference", () => {
		const set = new Set([1]);
		const map = new Map([["a", 1]]);
		const regexp = /a/g;

		expect(deepEqual(set, set)).toBe(true);
		expect(deepEqual(map, map)).toBe(true);
		expect(deepEqual(regexp, regexp)).toBe(true);

		expect(deepEqual(new Set([1]), new Set([1]))).toBe(false);
		expect(deepEqual(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(false);
		expect(deepEqual(/a/g, /a/g)).toBe(false);
	});

	it("never reports a class instance equal to a plain object", () => {
		class Point {
			x = 1;
		}
		expect(deepEqual(new Point(), { x: 1 })).toBe(false);
		expect(deepEqual(new Point(), new Point())).toBe(false);
		expect(deepEqual(Object.create(null), {})).toBe(false);
	});
});
