import z from "zod";

export const tagSchema = z.object({
	tagId: z.int().nonnegative(),
	text: z.string().min(1),
	key: z.string().min(1),
});

export type Tag = z.infer<typeof tagSchema>;

export const tagCategorySchema = z.object({
	text: z.string().min(1),
	possessiveText: z.string().min(1).nullable(),
	tags: z.array(tagSchema),
});

export type TagCategory = z.infer<typeof tagCategorySchema>;

export const profileTagLanguageSchema = z.object({
	language: z.string().min(1),
	categoryCollection: z.array(tagCategorySchema),
});

export type ProfileTagLanguage = z.infer<typeof profileTagLanguageSchema>;

export const profileTagsResponseSchema = z.array(profileTagLanguageSchema);

export type ProfileTagsResponse = z.infer<typeof profileTagsResponseSchema>;
