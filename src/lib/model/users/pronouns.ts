import z from "zod";

import { arrayOfParsableEntries } from "$lib/model/tolerance";

export const pronounSchema = z.object({
	pronounId: z.int().nonnegative(),
	pronoun: z.string().min(1),
});
export type Pronoun = z.infer<typeof pronounSchema>;

export const pronounsSchema = arrayOfParsableEntries({
	entries: pronounSchema,
	label: "pronouns",
});
