import z from "zod";

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
