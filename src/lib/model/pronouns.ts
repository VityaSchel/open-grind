import z from "zod";

export const pronounsSchema = z.array(
	z.object({
		pronounId: z.int().nonnegative(),
		pronoun: z.string().min(1),
	}),
);
