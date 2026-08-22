import z from "zod";

export const accountPreferencesSchema = z.object({
	profileId: z.coerce.number().int().nonnegative(),
	locationSearchOptOut: z.boolean(),
	incognito: z.boolean(),
	hideViewedMe: z.boolean(),
	approximateDistance: z.boolean(),
	viewRightNowNsfw: z.boolean(),
	showOnMap: z.boolean().optional(),
	mapLocationFuzzRadius: z.int().nullable().optional(),
});

export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;

export const accountPreferencesPatchSchema = accountPreferencesSchema
	.omit({ profileId: true })
	.partial();

export type AccountPreferencesPatch = z.infer<
	typeof accountPreferencesPatchSchema
>;

export const accountPreferencesUpdateSchema = z.object({
	settings: accountPreferencesPatchSchema,
});

export type AccountPreferencesUpdate = z.infer<
	typeof accountPreferencesUpdateSchema
>;
