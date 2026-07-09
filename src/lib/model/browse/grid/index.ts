import z from "zod";

import { filterGendersSchema } from "$lib/components/filters/filters";
import { geohashSchema } from "$lib/model/geohash";

export const gridQuerySchema = z.object({
	nearbyGeoHash: geohashSchema,
	exploreGeoHash: geohashSchema.optional(),
	photoOnly: z.boolean().optional(),
	faceOnly: z.boolean().optional(),
	notRecentlyChatted: z.boolean().optional(),
	hasAlbum: z.boolean().optional(),
	fresh: z.boolean().optional(),
	genders: filterGendersSchema.optional(),
	pageNumber: z.int().nonnegative().optional(),
});
