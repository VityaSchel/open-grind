import { describe, expect, it } from "vitest";

import {
	AGE_MAX,
	AGE_MIN,
	FilterPosition,
} from "#lib/model/browse/grid/filters.ts";
import { defaultRightNowFeedFilters } from "#lib/model/right-now/filters.ts";
import { rightNowFeedQuery } from "./feed-query";

const sentEntries = (query: object) =>
	Object.entries(query).filter(([, value]) => value !== undefined);

describe("rightNowFeedQuery", () => {
	it("sends only the newest-first sort for the defaults", () => {
		const query = rightNowFeedQuery(defaultRightNowFeedFilters);

		expect(sentEntries(query)).toEqual([["sort", "NEWEST"]]);
	});

	it.each([true, false])(
		"sends hosting %s while the hosting filter is on",
		(hosting) => {
			const query = rightNowFeedQuery({
				...defaultRightNowFeedFilters,
				hostingEnabled: true,
				hosting,
			});

			expect(query.hosting).toBe(hosting);
		},
	);

	it("leaves out hosting while the hosting filter is off", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			hostingEnabled: false,
			hosting: false,
		});

		expect(query.hosting).toBeUndefined();
	});

	it("sends both age bounds once the age filter is on and narrowed", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			ageEnabled: true,
			age: [25, AGE_MAX],
		});

		expect(query).toMatchObject({ ageMin: 25, ageMax: AGE_MAX });
	});

	it("leaves out an age filter left at the full range", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			ageEnabled: true,
			age: [AGE_MIN, AGE_MAX],
		});

		expect(query.ageMin).toBeUndefined();
		expect(query.ageMax).toBeUndefined();
	});

	it("leaves out a narrowed age range while the age filter is off", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			ageEnabled: false,
			age: [25, 40],
		});

		expect(query.ageMin).toBeUndefined();
		expect(query.ageMax).toBeUndefined();
	});

	it("sends the picked positions, Not specified included", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			positionEnabled: true,
			positions: [FilterPosition.Top, FilterPosition.NotSpecified],
		});

		expect(query.sexualPositions).toEqual([
			FilterPosition.Top,
			FilterPosition.NotSpecified,
		]);
	});

	it("leaves out a position filter that is on with nothing picked", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			positionEnabled: true,
			positions: [],
		});

		expect(query.sexualPositions).toBeUndefined();
	});

	it("leaves out picked positions while the position filter is off", () => {
		const query = rightNowFeedQuery({
			...defaultRightNowFeedFilters,
			positionEnabled: false,
			positions: [FilterPosition.Bottom],
		});

		expect(query.sexualPositions).toBeUndefined();
	});
});
