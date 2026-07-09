import z from "zod";

import {
	filterAcceptNSFWPicsSchema,
	filterBodyTypeSchema,
	filterLookingForSchema,
	filterMeetAtSchema,
	filterPositionSchema,
	filterRelationshipStatusSchema,
	filterTagsSchema,
	filterTribesSchema,
} from "$lib/components/filters/filters";
import { gridQuerySchema } from "$lib/model/browse/grid";

export const cascadeQuerySchema = z.object({
	...gridQuerySchema.shape,
	onlineOnly: z.boolean().optional(),
	ageMin: z.int().nonnegative().optional(),
	ageMax: z.int().nonnegative().optional(),
	heightCmMin: z.number().nonnegative().optional(),
	heightCmMax: z.number().nonnegative().optional(),
	weightGramsMin: z.number().nonnegative().optional(),
	weightGramsMax: z.number().nonnegative().optional(),
	tribes: filterTribesSchema.optional(),
	lookingFor: filterLookingForSchema.optional(),
	relationshipStatuses: filterRelationshipStatusSchema.optional(),
	bodyTypes: filterBodyTypeSchema.optional(),
	sexualPositions: filterPositionSchema.optional(),
	meetAt: filterMeetAtSchema.optional(),
	nsfwPics: filterAcceptNSFWPicsSchema.optional(),
	tags: filterTagsSchema.optional(),
	rightNow: z.boolean().optional(),
	favorites: z.boolean().optional(),
	showSponsoredProfiles: z.boolean().optional(),
	shuffle: z.boolean().optional(),
	hot: z.boolean().optional(),
});
