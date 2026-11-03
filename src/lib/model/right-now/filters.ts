import z from "zod";

import { gridSearchFiltersSchema } from "#lib/model/browse/grid/filters.ts";
import { rightNowFeedSortSchema } from "./feed";

export const rightNowFeedFiltersSchema = gridSearchFiltersSchema
	.pick({
		ageEnabled: true,
		age: true,
		positionEnabled: true,
		positions: true,
	})
	.extend({
		sort: rightNowFeedSortSchema.default("NEWEST"),
		hostingEnabled: z.boolean().default(false),
		hosting: z.boolean().default(true),
	});
export type RightNowFeedFilters = z.infer<typeof rightNowFeedFiltersSchema>;

export const defaultRightNowFeedFilters: RightNowFeedFilters =
	rightNowFeedFiltersSchema.parse({});
