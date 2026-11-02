import z from "zod";

import {
	AGE_MAX,
	AGE_MIN,
	filterAgeEnabledSchema,
	filterAgeSchema,
	filterPositionEnabledSchema,
	filterPositionSchema,
} from "#lib/model/browse/grid/filters.ts";
import { rightNowFeedSortSchema } from "./feed";

export const rightNowFeedFiltersSchema = z.object({
	sort: rightNowFeedSortSchema.default("NEWEST"),
	hostingEnabled: z.boolean().default(false),
	hosting: z.boolean().default(true),
	ageEnabled: filterAgeEnabledSchema.default(false),
	age: filterAgeSchema.default([AGE_MIN, AGE_MAX]),
	positionEnabled: filterPositionEnabledSchema.default(false),
	positions: filterPositionSchema.default([]),
});
export type RightNowFeedFilters = z.infer<typeof rightNowFeedFiltersSchema>;

export const defaultRightNowFeedFilters: RightNowFeedFilters =
	rightNowFeedFiltersSchema.parse({});
