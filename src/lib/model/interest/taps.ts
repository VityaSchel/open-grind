import z from "zod";

export const TapType = { Friendly: 0, Hot: 1, Looking: 2 } as const;

const TAP_TYPE_NONE = 3;

export const tapTypes = {
	[TapType.Friendly]: "Cookie",
	[TapType.Hot]: "Fire",
	[TapType.Looking]: "Demon",
};

export const tapTypeSchema = z.enum(TapType);

export const tapTypeOrNoneSchema = tapTypeSchema.or(
	z.literal(TAP_TYPE_NONE).transform(() => null),
);

export type TapType = z.infer<typeof tapTypeSchema>;
