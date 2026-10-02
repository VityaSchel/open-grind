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
			filters: {
				...defaultFilters,
				genderEnabled: true,
				genders: [1, GENDER_ASK_ME],
			},
		});

		expect(query.genders).toEqual([1]);
	});

	it("never sends tags that moved to genders", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				tagsEnabled: true,
				tags: ["ftm", "coffee", "mtf"],
			},
		});

		expect(query.tags).toEqual(["coffee"]);
	});

	it("never sends the Trans tribe, which moved to genders", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				tribesEnabled: true,
				tribes: [Tribe.Bear, Tribe.Trans],
			},
		});

		expect(query.tribes).toEqual([Tribe.Bear]);
	});

	it("asks for fresh profiles only while Fresh is on", () => {
		const on = buildCascadeQuery({
			geohash,
			filters: { ...defaultFilters, isFresh: true },
		});
		const off = buildCascadeQuery({ geohash, filters: defaultFilters });

		expect(on.fresh).toBe(true);
		expect(off.fresh).toBeUndefined();
	});

	it("leaves out a list filter that is on but has nothing sendable", () => {
		const query = buildCascadeQuery({
			geohash,
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

	it("sends the official weight maximum in grams", () => {
		const query = buildCascadeQuery({
			geohash,
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
		expect(sentFilterKeys(defaultFilters)).toEqual([]);
	});

	it("ignores a filter that is on but sends nothing", () => {
		expect(
			sentFilterKeys({
				...defaultFilters,
				isFavorite: true,
				tribesEnabled: true,
				tribes: [Tribe.Trans],
			}),
		).toEqual(["favorites"]);
	});

	it("lists Fresh as a sent filter", () => {
		expect(sentFilterKeys({ ...defaultFilters, isFresh: true })).toEqual([
			"fresh",
		]);
	});

	it("lists every filter the request carries", () => {
		expect(
			sentFilterKeys({
				...defaultFilters,
				isFavorite: true,
				genderEnabled: true,
				genders: [-1],
			}),
		).toEqual(["favorites", "genders"]);
	});
});
