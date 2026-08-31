import z from "zod";

import { tapTypeOrNoneSchema } from "$lib/model/interest/taps";
import { rightNowAttributionStatusSchema } from "$lib/model/right-now";
import { knownValueOrNull } from "$lib/model/tolerance";
import { unixTimestampMsSchema } from "$lib/model/types";
import {
	profileMaskedMinSchema,
	profileMinSchema,
} from "$lib/model/users/profiles";

export const tapProfileSchema = z.object({
	...profileMaskedMinSchema.shape,
	...profileMinSchema.shape,
	timestamp: unixTimestampMsSchema,
	tapType: knownValueOrNull({
		value: tapTypeOrNoneSchema,
		label: "tap tapType",
	}),
	lastOnline: unixTimestampMsSchema.nullable(),
	isBoosting: z.boolean(),
	isMutual: z.boolean(),
	rightNowType: z.string(),
	rightNowStatus: rightNowAttributionStatusSchema.nullish().catch("NONE"),
	isViewable: z.boolean(),
});

export type TapProfile = z.infer<typeof tapProfileSchema>;
