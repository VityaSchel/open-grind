import { describe, expect, it } from "vitest";

import {
	defaultFilters,
	filterAgeSchema,
	FilterBodyType,
	filterHeightSchema,
	FilterLookingFor,
	FilterPosition,
	filterPositionSchema,
	filterWeightSchema,
	gridSearchFiltersSchema,
} from "$lib/components/filters/filters";

describe("grid search filter schemas", () => {
	it("accepts the default filter state", () => {
		expect(gridSearchFiltersSchema.parse(defaultFilters)).toEqual(
			defaultFilters,
		);
	});

	it("enforces filter range boundaries", () => {
		expect(filterAgeSchema.safeParse([18, 102]).success).toBe(true);
		expect(filterAgeSchema.safeParse([17, 102]).success).toBe(false);
		expect(filterHeightSchema.safeParse([120, 242]).success).toBe(true);
		expect(filterHeightSchema.safeParse([119, 242]).success).toBe(false);
		expect(filterWeightSchema.safeParse([40, 273]).success).toBe(true);
		expect(filterWeightSchema.safeParse([40, 274]).success).toBe(false);
	});

	it("accepts not-specified aliases for filters that expose them", () => {
		expect(filterPositionSchema.parse([FilterPosition.NotSpecified])).toEqual([
			FilterPosition.NotSpecified,
		]);
		expect(FilterBodyType.NotSpecified).toBe(-1);
		expect(FilterLookingFor.NotSpecified).toBe(-1);
	});
});
