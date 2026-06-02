import z from "zod";

import { profileMaskedMinSchema, profileMinSchema } from "$lib/model/profile";
import { unixTimestampMsSchema } from "$lib/model/types";

export const TapType = {
	Friendly: 0,
	Hot: 1,
	Looking: 2,
	// None: 3,
} as const;

export const tapTypes = {
	[TapType.Friendly]: "Cookie",
	[TapType.Hot]: "Fire",
	[TapType.Looking]: "Demon",
	// [TapType.None]: "None",
};

export const tapTypeSchema = z.enum(TapType);

export type TapType = z.infer<typeof tapTypeSchema>;

export const tapProfileSchema = z.object({
	...profileMaskedMinSchema.shape,
	...profileMinSchema.shape,
	timestamp: unixTimestampMsSchema,
	tapType: tapTypeSchema,
	lastOnline: unixTimestampMsSchema,
	isBoosting: z.boolean(),
	isMutual: z.boolean(),
	rightNowType: z.string(),
	isViewable: z.boolean(),
});
