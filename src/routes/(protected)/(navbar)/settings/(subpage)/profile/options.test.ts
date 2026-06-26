import { describe, expect, it } from "vitest";

import {
	ageRange,
	fieldLimits,
	heightCmRange,
	optionsFromMap,
	weightKgRange,
} from "./options";

describe("profile edit options", () => {
	it("converts numeric map keys into numeric option values", () => {
		expect(optionsFromMap({ 1: "One", 20: "Twenty" })).toEqual([
			{ value: 1, label: "One" },
			{ value: 20, label: "Twenty" },
		]);
	});

	it("keeps form limits aligned with supported profile edit ranges", () => {
		expect(fieldLimits).toEqual({ displayName: 25, aboutMe: 255 });
		expect(heightCmRange).toEqual({ min: 120, max: 250 });
		expect(weightKgRange).toEqual({ min: 30, max: 250 });
		expect(ageRange).toEqual({ min: 18, max: 99 });
	});
});
