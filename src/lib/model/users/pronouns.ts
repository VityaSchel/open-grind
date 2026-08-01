import z from "zod";

export const pronounSchema = z.object({
	pronounId: z.int().nonnegative(),
	pronoun: z.string().min(1),
});
export type Pronoun = z.infer<typeof pronounSchema>;

export const pronounsSchema = z.array(pronounSchema);
