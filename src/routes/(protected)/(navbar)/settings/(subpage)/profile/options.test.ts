import { describe, expect, it } from "vitest";

import {
	ageRange,
	fieldLimits,
	heightCmRange,
	positionOptions,
	weightKgRange,
} from "./options";

describe("profile edit options", () => {
	it("keeps form limits aligned with supported profile edit ranges", () => {
		expect(fieldLimits).toEqual({ displayName: 25, aboutMe: 255 });
		expect(heightCmRange).toEqual({ min: 120, max: 250 });
		expect(weightKgRange).toEqual({ min: 30, max: 250 });
		expect(ageRange).toEqual({ min: 18, max: 99 });
	});

	it("lists positions along the spectrum from top to side", () => {
		expect(positionOptions.map((option) => option.label)).toEqual([
			"Top",
			"Vers Top",
			"Versatile",
			"Vers Bottom",
			"Bottom",
			"Side",
		]);
	});

	it("gives every position an icon of its own", () => {
		const icons = positionOptions.map((option) => option.icon);

		expect(new Set(icons).size).toBe(positionOptions.length);
	});
});
