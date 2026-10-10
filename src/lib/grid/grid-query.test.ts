import { describe, expect, it } from "vitest";

import {
	AGE_MAX,
	defaultFilters,
	GENDER_ASK_ME,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import { Tribe } from "$lib/model/users/profiles";
import { buildCascadeQuery, sentFilterKeys } from "./grid-query";

const geohash = "u33dc0";

describe("buildCascadeQuery", () => {
	it("never sends the Ask me gender", () => {
		const query = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: {
				...defaultFilters,
				genderEnabled: true,
				genders: [1, GENDER_ASK_ME],
			},
		});

		expect(query.genders).toEqual([1]);
	});

	it.each([
		["on", true, ["coffee"]],
		["off", false, ["ftm", "coffee", "mtf"]],
	])(
		"while the gender filter flag is %s, sends the tags %j",
		(_, genderFilterFlag, tags) => {
			const query = buildCascadeQuery({
				geohash,
				genderFilterFlag,
				filters: {
					...defaultFilters,
					tagsEnabled: true,
					tags: ["ftm", "coffee", "mtf"],
				},
			});

			expect(query.tags).toEqual(tags);
		},
	);

	it.each([
		["on", true, [Tribe.Bear]],
		["off", false, [Tribe.Bear, Tribe.Trans]],
	])(
		"while the gender filter flag is %s, sends the tribes %j",
		(_, genderFilterFlag, tribes) => {
			const query = buildCascadeQuery({
				geohash,
				genderFilterFlag,
				filters: {
					...defaultFilters,
					tribesEnabled: true,
					tribes: [Tribe.Bear, Tribe.Trans],
				},
			});

			expect(query.tribes).toEqual(tribes);
		},
	);

	it("asks for fresh profiles only while Fresh is on", () => {
		const on = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: { ...defaultFilters, isFresh: true },
		});
		const off = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: defaultFilters,
		});

		expect(on.fresh).toBe(true);
		expect(off.fresh).toBeUndefined();
	});

	it("leaves out a list filter that is on but has nothing sendable", () => {
		const query = buildCascadeQuery({
			geohash,
			genderFilterFlag: true,
			filters: {
				...defaultFilters,
				genderEnabled: true,
				genders: [GENDER_ASK_ME],
				tribesEnabled: true,
				tribes: [Tribe.Trans],
				positionEnabled: true,
				bodyTypesEnabled: true,
				relationshipStatusesEnabled: true,
				acceptNSFWPicsEnabled: true,
				lookingForEnabled: true,
				meetAtEnabled: true,
				healthPracticesEnabled: true,
				tagsEnabled: true,
			},
		});

		expect(
			Object.entries(query).filter(([, value]) => value !== undefined),
		).toEqual([["nearbyGeoHash", geohash]]);
	});
});

describe("buildCascadeQuery ranges", () => {
	it("leaves out a range left at its full limits", () => {
		const query = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: {
				...defaultFilters,
				ageEnabled: true,
				heightEnabled: true,
				weightEnabled: true,
			},
		});

		expect(query.ageMin).toBeUndefined();
		expect(query.heightCmMin).toBeUndefined();
		expect(query.weightGramsMin).toBeUndefined();
	});

	it("sends both bounds once one moves, with the official weight ends in grams", () => {
		const query = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: {
				...defaultFilters,
				ageEnabled: true,
				age: [30, AGE_MAX],
				weightEnabled: true,
				weight: [WEIGHT_KG_MIN, 80],
			},
		});

		expect(query).toMatchObject({
			ageMin: 30,
			ageMax: 99,
			weightGramsMin: 40823,
			weightGramsMax: 80000,
		});
	});

	it("sends whole grams for a weight picked in pounds", () => {
		const query = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: {
				...defaultFilters,
				weightEnabled: true,
				weight: [64.4, 128.8],
			},
		});

		expect(query).toMatchObject({
			weightGramsMin: 64400,
			weightGramsMax: 128800,
		});
	});

	it("sends the official weight maximum in grams", () => {
		const query = buildCascadeQuery({
			geohash,
			genderFilterFlag: false,
			filters: {
				...defaultFilters,
				weightEnabled: true,
				weight: [60, WEIGHT_KG_MAX],
			},
		});

		expect(query).toMatchObject({
			weightGramsMin: 60000,
			weightGramsMax: 272156,
		});
	});
});

describe("sentFilterKeys", () => {
	it("lists nothing for the defaults", () => {
		expect(
			sentFilterKeys({
				filters: defaultFilters,
				genderFilterFlag: false,
			}),
		).toEqual([]);
	});

	it("ignores a filter that is on but sends nothing", () => {
		expect(
			sentFilterKeys({
				filters: {
					...defaultFilters,
					isFavorite: true,
					tribesEnabled: true,
					tribes: [Tribe.Trans],
				},
				genderFilterFlag: true,
			}),
		).toEqual(["favorites"]);
	});

	it("lists Fresh as a sent filter", () => {
		expect(
			sentFilterKeys({
				filters: { ...defaultFilters, isFresh: true },
				genderFilterFlag: false,
			}),
		).toEqual(["fresh"]);
	});

	it("lists every filter the request carries", () => {
		expect(
			sentFilterKeys({
				filters: {
					...defaultFilters,
					isFavorite: true,
					genderEnabled: true,
					genders: [-1],
				},
				genderFilterFlag: false,
			}),
		).toEqual(["favorites", "genders"]);
	});
});
