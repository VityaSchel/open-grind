import z from "zod";

export const genderIdSchema = z.int().nonnegative();

export const gendersSchema = z.array(
	z.object({
		genderId: genderIdSchema,
		gender: z.string().min(1),
		genderPlural: z.string().min(1),
		displayGroup: z.int().nonnegative(),
		sortProfile: z.int().nonnegative().nullable(),
		sortFilter: z.int().nonnegative().nullable(),
		excludeOnProfileSelection: z.array(z.int().nonnegative()).nullable(),
		excludeOnFilterSelection: z.array(z.int().nonnegative()).nullable(),
		alsoClassifiedAs: z.array(z.int().nonnegative()),
	}),
);
