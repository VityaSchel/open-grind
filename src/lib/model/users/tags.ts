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

export const tagsOf = (languages: ProfileTagsResponse) =>
	languages.flatMap((language) =>
		language.categoryCollection.flatMap((category) => category.tags),
	);

export function tagTextByKey(languages: ProfileTagsResponse) {
	const textByKey = new Map<string, string>();
	for (const { key, text } of tagsOf(languages)) {
		if (!textByKey.has(key)) textByKey.set(key, text);
	}
	return textByKey;
}

const TAG_KEYS_MOVED_TO_GENDERS = ["ftm", "mtf"];

export const isTagKeyOffered = ({
	key,
	genderFilterFlag,
}: {
	key: string;
	genderFilterFlag: boolean;
}) => !genderFilterFlag || !TAG_KEYS_MOVED_TO_GENDERS.includes(key);
