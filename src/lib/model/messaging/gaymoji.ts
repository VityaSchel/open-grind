import z from "zod";

import { arrayOfParsableEntries } from "$lib/model/tolerance";
import { unixTimestampMsSchema } from "$lib/model/types";

export const gaymojiCategorySchema = z.string().min(1);

export const gaymojiSchema = z.object({
	name: z.string().min(1),
	id: z.string().regex(/^[\w,.-]+\.png$/),
	category: gaymojiCategorySchema,
	expiredTime: unixTimestampMsSchema.optional(),
});

export type Gaymoji = z.infer<typeof gaymojiSchema>;

export const gaymojiManifestSchema = z.object({
	lastUpdateTime: unixTimestampMsSchema,
	gaymoji: arrayOfParsableEntries({
		entries: gaymojiSchema,
		label: "gaymoji manifest gaymoji",
	}),
	category: arrayOfParsableEntries({
		entries: z.object({
			name: gaymojiCategorySchema,
			expiredTime: unixTimestampMsSchema.optional(),
		}),
		label: "gaymoji manifest category",
	}),
});

export type GaymojiManifest = z.infer<typeof gaymojiManifestSchema>;
