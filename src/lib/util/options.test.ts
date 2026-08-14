import { describe, expect, it } from "vitest";

import { optionsFromMap } from "./options";

describe("optionsFromMap", () => {
	it("converts numeric map keys into numeric option values", () => {
		expect(optionsFromMap({ 1: "One", 20: "Twenty" })).toEqual([
			{ value: 1, label: "One" },
			{ value: 20, label: "Twenty" },
		]);
	});
});
