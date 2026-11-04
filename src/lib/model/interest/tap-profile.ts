import z from "zod";

import { tapTypeOrNoneSchema } from "#lib/model/interest/taps.ts";
import { rightNowAttributionStatusSchema } from "#lib/model/right-now.ts";
import { knownValueOrNull } from "#lib/model/tolerance.ts";
import { unixTimestampMsSchema } from "#lib/model/types.ts";
import {
	profileMaskedMinSchema,
	profileMinSchema,
} from "#lib/model/users/profiles.ts";

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
