import { describe, expect, it } from "vitest";

import {
	labelFromMap,
	type Option,
	optionsFromMap,
	selectionKeepingUnlisted,
} from "./options";

const tribes: Record<number, string> = { 1: "Bear", 3: "Daddy" };
const options: Option<number>[] = [
	{ value: 1, label: "Bear" },
	{ value: 3, label: "Daddy" },
];
const unknownToUs = 9_999;

describe("optionsFromMap", () => {
	it("converts numeric map keys into numeric option values", () => {
		expect(optionsFromMap({ 1: "One", 20: "Twenty" })).toEqual([
			{ value: 1, label: "One" },
			{ value: 20, label: "Twenty" },
		]);
	});
});

describe("labelFromMap", () => {
	it("resolves a known id", () => {
		expect(labelFromMap({ labels: tribes, id: 3 })).toBe("Daddy");
	});

	it("yields undefined for an id the vocabulary does not describe", () => {
		expect(
			labelFromMap({ labels: tribes, id: unknownToUs }),
		).toBeUndefined();
	});
});

describe("selectionKeepingUnlisted", () => {
	it("applies the new selection", () => {
		expect(
			selectionKeepingUnlisted({
				values: [1],
				selectedKeys: ["1", "3"],
				options,
			}),
		).toEqual([1, 3]);
	});

	it("keeps a value no option describes when the selection changes", () => {
		expect(
			selectionKeepingUnlisted({
				values: [unknownToUs, 1],
				selectedKeys: ["3"],
				options,
			}),
		).toEqual([unknownToUs, 3]);
	});

	it("keeps that value even when everything selectable is cleared", () => {
		expect(
			selectionKeepingUnlisted({
				values: [unknownToUs, 1],
				selectedKeys: [],
				options,
			}),
		).toEqual([unknownToUs]);
	});

	it("does not duplicate a value that is also selectable", () => {
		expect(
			selectionKeepingUnlisted({
				values: [1],
				selectedKeys: ["1"],
				options,
			}),
		).toEqual([1]);
	});
});
