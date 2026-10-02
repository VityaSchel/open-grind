import { describe, expect, it } from "vitest";

import {
	ageRange,
	fieldLimits,
	heightCmRange,
	heightInchOptions,
	heightInchRange,
	positionOptions,
	weightKgRange,
	weightPoundRange,
} from "./options";

describe("profile edit options", () => {
	it("keeps form limits aligned with supported profile edit ranges", () => {
		expect(fieldLimits).toEqual({ displayName: 25, aboutMe: 255 });
		expect(heightCmRange).toEqual({ min: 120, max: 250 });
		expect(weightKgRange).toEqual({ min: 30, max: 250 });
		expect(ageRange).toEqual({ min: 18, max: 99 });
	});

	it("keeps the imperial limits at the metric ones, in whole inches and pounds", () => {
		expect(heightInchRange).toEqual({ min: 47, max: 98 });
		expect(weightPoundRange).toEqual({ min: 66, max: 551 });
	});

	it("offers one height per inch, labelled in feet and inches", () => {
		expect(heightInchOptions).toHaveLength(52);
		expect(heightInchOptions[0]).toEqual({ value: 47, label: "3'11\"" });
		expect(heightInchOptions[25]).toEqual({ value: 72, label: "6'0\"" });
		expect(heightInchOptions.at(-1)).toEqual({ value: 98, label: "8'2\"" });
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
