import z from "zod";

import { filterHealthPracticesSchema } from "$lib/components/filters/filters";
import { cascadeQuerySchema } from ".";

export const cascadeV3QuerySchema = z.object({
	...cascadeQuerySchema.shape,
	exploreUuid: z.unknown().optional(),
	sexualHealth: filterHealthPracticesSchema.optional(),
});
