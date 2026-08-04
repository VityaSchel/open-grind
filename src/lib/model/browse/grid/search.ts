import z from "zod";

import { gridQuerySchema } from "$lib/model/browse/grid";
import {
	filterAcceptNSFWPicsSchema,
	filterBodyTypeSchema,
	filterLookingForSchema,
	filterMeetAtSchema,
	filterPositionSchema,
	filterRelationshipStatusSchema,
	filterTribesSchema,
} from "$lib/model/browse/grid/filters";
import { mediaHashPublicSchema } from "$lib/model/media";

export const searchQuerySchema = gridQuerySchema.extend({
	online: z.boolean().optional(),
	ageMinimum: z.int().nonnegative().optional(),
	ageMaximum: z.int().nonnegative().optional(),
	heightMinimum: z.number().nonnegative().optional(),
	heightMaximum: z.number().nonnegative().optional(),
	weightMinimum: z.number().nonnegative().optional(),
	weightMaximum: z.number().nonnegative().optional(),
	grindrTribesIds: filterTribesSchema.optional(),
	lookingForIds: filterLookingForSchema.optional(),
	relationshipStatusIds: filterRelationshipStatusSchema.optional(),
	bodyTypeIds: filterBodyTypeSchema.optional(),
	sexualPositionIds: filterPositionSchema.optional(),
	meetAtIds: filterMeetAtSchema.optional(),
	nsfwIds: filterAcceptNSFWPicsSchema.optional(),
	profileTags: z.string().optional(),
	searchAfterDistance: z.string().optional(),
	searchAfterProfileId: z.string().optional(),
	freeFilter: z.boolean().optional(),
});

export const searchProfileSchema = z.object({
	profileId: z.coerce.number().int().nonnegative(),
	displayName: z.string().nullable(),
	age: z.int().nonnegative().nullable(),
	distance: z.number().nullable(),
	medias: z.array(z.object({ mediaHash: mediaHashPublicSchema })).nullable(),
});

export const searchProfilesResponseSchema = z.object({
	profiles: z.array(searchProfileSchema),
});
