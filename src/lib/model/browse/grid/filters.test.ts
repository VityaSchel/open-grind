import { describe, expect, it } from "vitest";

import {
	compareFilterGenders,
	defaultFilters,
	FilterAcceptNSFWPics,
	filterAcceptNSFWPicsSchema,
	filterAgeSchema,
	FilterBodyType,
	filterGendersSchema,
	filterHeightSchema,
	FilterLookingFor,
	FilterPosition,
	filterPositionSchema,
	filterWeightSchema,
	GENDER_ASK_ME,
	gridSearchFiltersSchema,
	isFilterableGender,
	isFilterableGenderId,
	isFilterableTagKey,
	rangeBoundTexts,
	tagCatalog,
} from "$lib/model/browse/grid/filters";
import { formatWeightKg } from "$lib/util/units";

describe("grid search filter schemas", () => {
	it("accepts the default filter state", () => {
		expect(gridSearchFiltersSchema.parse(defaultFilters)).toEqual(
			defaultFilters,
		);
	});

	it("clamps saved ranges into the official app's limits", () => {
		expect(filterAgeSchema.parse([17, 102])).toEqual([18, 99]);
		expect(filterHeightSchema.parse([120, 242])).toEqual([121, 241]);
		expect(filterWeightSchema.parse([40, 273])).toEqual([41, 272]);
		expect(filterAgeSchema.safeParse([18]).success).toBe(false);
	});

	it("keeps old saved preferences parsable", () => {
		expect(
			gridSearchFiltersSchema.parse({
				ageEnabled: true,
				age: [30, 102],
				weight: [40, 273],
			}),
		).toMatchObject({ age: [30, 99], weight: [41, 272] });
	});

	it("accepts not-specified aliases for filters that expose them", () => {
		expect(
			filterPositionSchema.parse([FilterPosition.NotSpecified]),
		).toEqual([FilterPosition.NotSpecified]);
		expect(FilterBodyType.NotSpecified).toBe(-1);
		expect(FilterLookingFor.NotSpecified).toBe(-1);
		expect(FilterAcceptNSFWPics.NotSpecified).toBe(-1);
		expect(
			filterAcceptNSFWPicsSchema.parse([
				FilterAcceptNSFWPics.NotSpecified,
			]),
		).toEqual([FilterAcceptNSFWPics.NotSpecified]);
	});

	it("accepts not-specified (-1) alongside gender ids", () => {
		expect(filterGendersSchema.parse([-1, 42])).toEqual([-1, 42]);
		expect(filterGendersSchema.safeParse([-2]).success).toBe(false);
	});
});

describe("filterable values", () => {
	const gender = ({
		genderId,
		displayGroup = 1,
		sortFilter = null,
	}: {
		genderId: number;
		displayGroup?: number;
		sortFilter?: number | null;
	}) => ({ genderId, gender: String(genderId), displayGroup, sortFilter });

	it("offers every displayed gender, with or without a filter sort position", () => {
		for (const genderId of [1, 2, 4, 6])
			expect(isFilterableGender(gender({ genderId }))).toBe(true);
		expect(
			isFilterableGender(
				gender({ genderId: 10, displayGroup: 2, sortFilter: 3 }),
			),
		).toBe(true);
	});

	it("does not offer a gender outside the display groups", () => {
		expect(
			isFilterableGender(gender({ genderId: 0, displayGroup: 0 })),
		).toBe(false);
	});

	it("never offers Ask me", () => {
		expect(
			isFilterableGender(
				gender({ genderId: GENDER_ASK_ME, displayGroup: 2 }),
			),
		).toBe(false);
		expect(isFilterableGenderId(GENDER_ASK_ME)).toBe(false);
		expect(isFilterableGenderId(4)).toBe(true);
	});

	it("orders the primary genders first, then by filter sort position with unsorted last", () => {
		const catalog = [
			gender({ genderId: 0, displayGroup: 0 }),
			gender({ genderId: 4 }),
			gender({ genderId: 1 }),
			gender({ genderId: 5, sortFilter: 1 }),
			gender({ genderId: 6 }),
			gender({ genderId: 3, sortFilter: 10 }),
			gender({ genderId: 7, sortFilter: 2 }),
			gender({ genderId: 2 }),
			gender({ genderId: 10, displayGroup: 2, sortFilter: 3 }),
			gender({ genderId: 11, displayGroup: 2, sortFilter: 4 }),
			gender({ genderId: GENDER_ASK_ME, displayGroup: 2 }),
			gender({ genderId: 12, displayGroup: 2, sortFilter: 6 }),
		];

		expect(
			catalog
				.toSorted(compareFilterGenders)
				.map(({ genderId }) => genderId),
		).toEqual([1, 4, 5, 2, 6, 7, 3, 10, 11, 12, 0, GENDER_ASK_ME]);
	});

	it("hides the tags that moved to genders", () => {
		expect(isFilterableTagKey("ftm")).toBe(false);
		expect(isFilterableTagKey("mtf")).toBe(false);
		expect(isFilterableTagKey("coffee")).toBe(true);
	});
});

const languages = [
	{
		language: "en",
		categoryCollection: [
			{
				text: "Interests",
				possessiveText: null,
				tags: [
					{ tagId: 1, key: "hiking", text: "Hiking" },
					{ tagId: 2, key: "gaming", text: "Gaming" },
					{ tagId: 3, key: "ftm", text: "FTM" },
				],
			},
		],
	},
	{
		language: "de",
		categoryCollection: [
			{
				text: "Interessen",
				possessiveText: null,
				tags: [{ tagId: 11, key: "hiking", text: "Wandern" }],
			},
		],
	},
];

describe("tagCatalog", () => {
	it("lists each key once with the first language's text", () => {
		const catalog = tagCatalog(languages);

		expect(catalog.flat.map(({ key, text }) => [key, text])).toEqual([
			["gaming", "Gaming"],
			["hiking", "Hiking"],
		]);
		expect(catalog.textOf("hiking")).toBe("Hiking");
	});

	it("leaves the tags that moved to genders out of the lists", () => {
		const catalog = tagCatalog(languages);

		expect(catalog.categories[0]?.tags.map(({ key }) => key)).toEqual([
			"hiking",
			"gaming",
		]);
		expect(catalog.keysOf(["FTM"])).toEqual(["ftm"]);
	});

	it("finds a key by its text in any language", () => {
		const catalog = tagCatalog(languages);

		expect(
			catalog.flat.find(({ key }) => key === "hiking")?.textsLower,
		).toEqual(["hiking", "wandern"]);
		expect(
			catalog.keysOf(["Wandern", "hiking", "gaming", "unknown"]),
		).toEqual(["hiking", "gaming", "unknown"]);
	});
});

describe("rangeBoundTexts", () => {
	it("names an open bound instead of formatting it", () => {
		expect(
			rangeBoundTexts({
				floor: 40,
				ceiling: 200,
				range: [81, 200],
				format: formatWeightKg,
				units: "metric",
			}),
		).toEqual(["81 kg", "No max"]);
	});

	it("treats a missing bound as open", () => {
		expect(
			rangeBoundTexts({
				floor: 40,
				ceiling: 200,
				range: [],
				format: formatWeightKg,
				units: "metric",
			}),
		).toEqual(["No min", "No max"]);
	});

	it("formats the bounds in the given units", () => {
		expect(
			rangeBoundTexts({
				floor: 40,
				ceiling: 200,
				range: [40, 100],
				format: formatWeightKg,
				units: "imperial",
			}),
		).toEqual(["No min", "220 lb"]);
	});
});
