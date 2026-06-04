import z from "zod";

import { tapTypeSchema } from "$lib/model/interest/taps";
import { profileMaskedMinSchema, profileMinSchema } from "$lib/model/profile";
import { unixTimestampMsSchema } from "$lib/model/types";

export const tapProfileSchema = z.object({
	...profileMaskedMinSchema.shape,
	...profileMinSchema.shape,
	timestamp: unixTimestampMsSchema,
	tapType: tapTypeSchema.or(z.literal(3).transform(() => null)),
	lastOnline: unixTimestampMsSchema.nullable(),
	isBoosting: z.boolean(),
	isMutual: z.boolean(),
	rightNowType: z.string(),
	isViewable: z.boolean(),
});

export type TapProfile = z.infer<typeof tapProfileSchema>;
