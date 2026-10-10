import { describe, expect, it } from "vitest";

import {
	ageRange,
	buildGenderOptions,
	buildTagOptions,
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

	it("lists the primary genders first, then by profile sort position", () => {
		const { options } = buildGenderOptions([
			{ genderId: 0, gender: "-", displayGroup: 0 },
			{
				genderId: 62,
				gender: "Ask Me",
				displayGroup: 2,
				sortProfile: 16,
			},
			{
				genderId: 10,
				gender: "Agender",
				displayGroup: 2,
				sortProfile: 1,
			},
			{ genderId: 3, gender: "Non-Binary", displayGroup: 1 },
			{ genderId: 2, gender: "Woman", displayGroup: 1 },
			{ genderId: 4, gender: "Cis Man", displayGroup: 1 },
			{ genderId: 1, gender: "Man", displayGroup: 1 },
		]);

		expect(options.map((option) => option.label)).toEqual([
			"Man",
			"Cis Man",
			"Woman",
			"Non-Binary",
			"Agender",
			"Ask Me",
		]);
	});
});

describe("buildTagOptions", () => {
	const tags = [
		{
			language: "en",
			categoryCollection: [
				{
					text: "Identity",
					possessiveText: null,
					tags: [
						{ tagId: 1, key: "ftm", text: "FTM" },
						{ tagId: 2, key: "hiking", text: "Hiking" },
						{ tagId: 3, key: "mtf", text: "MTF" },
					],
				},
			],
		},
	];

	it("offers only the tags it is told to and still labels the rest", () => {
		const { options, resolveLabel } = buildTagOptions({
			tags,
			isOffered: (key) => key === "hiking",
		});

		expect(options.map(({ value }) => value)).toEqual(["hiking"]);
		expect(resolveLabel("ftm")).toBe("FTM");
	});

	it("sorts the offered tags by their text", () => {
		const { options } = buildTagOptions({ tags, isOffered: () => true });

		expect(options.map(({ label }) => label)).toEqual([
			"FTM",
			"Hiking",
			"MTF",
		]);
	});
});
