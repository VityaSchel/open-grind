import z from "zod";

import { arrayOfParsableEntries } from "$lib/model/tolerance";

export const genderIdSchema = z.int().nonnegative();

export const genderSchema = z.object({
	genderId: genderIdSchema,
	gender: z.string().min(1),
	genderPlural: z.string().min(1).nullish(),
	displayGroup: z.int().nonnegative(),
	sortProfile: z.int().nonnegative().nullish(),
	sortFilter: z.int().nonnegative().nullish(),
	excludeOnProfileSelection: z.array(z.int().nonnegative()).nullish(),
	excludeOnFilterSelection: z.array(z.int().nonnegative()).nullish(),
	alsoClassifiedAs: z.array(z.int().nonnegative()).optional(),
});
export type Gender = z.infer<typeof genderSchema>;

export const gendersSchema = arrayOfParsableEntries({
	entries: genderSchema,
	label: "genders",
});
