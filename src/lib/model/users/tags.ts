import z from "zod";

import { arrayOfParsableEntries } from "$lib/model/tolerance";

export const tagSchema = z.object({
	tagId: z.int().nonnegative(),
	text: z.string().min(1),
	key: z.string().min(1),
});

export type Tag = z.infer<typeof tagSchema>;

export const tagCategorySchema = z.object({
	text: z.string().min(1),
	possessiveText: z.string().min(1).nullable(),
	tags: arrayOfParsableEntries({ entries: tagSchema, label: "profile tags" }),
});

export type TagCategory = z.infer<typeof tagCategorySchema>;

export const profileTagLanguageSchema = z.object({
	language: z.string().min(1),
	categoryCollection: arrayOfParsableEntries({
		entries: tagCategorySchema,
		label: "profile tag categories",
	}),
});

export type ProfileTagLanguage = z.infer<typeof profileTagLanguageSchema>;

export const profileTagsResponseSchema = arrayOfParsableEntries({
	entries: profileTagLanguageSchema,
	label: "profile tag languages",
});

export type ProfileTagsResponse = z.infer<typeof profileTagsResponseSchema>;
