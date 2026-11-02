import z from "zod";

import { filterPositionSchema } from "#lib/model/browse/grid/filters.ts";
import { mediaHashPublicSchema, mediaUrlSchema } from "#lib/model/media.ts";
import {
	arrayOfKnownVariants,
	arrayOfParsableEntries,
	knownValueOrNull,
	serverDefault,
} from "#lib/model/tolerance.ts";
import { unixTimestampMsSchema } from "#lib/model/types.ts";

export const rightNowFeedSortSchema = z.enum(["DISTANCE", "NEWEST"]);
export type RightNowFeedSort = z.infer<typeof rightNowFeedSortSchema>;

export const rightNowFeedQuerySchema = z.object({
	sort: rightNowFeedSortSchema.optional(),
	hosting: z.boolean().optional(),
	ageMin: z.int().nonnegative().optional(),
	ageMax: z.int().nonnegative().optional(),
	sexualPositions: filterPositionSchema.optional(),
});
export type RightNowFeedQuery = z.infer<typeof rightNowFeedQuerySchema>;

export const rightNowPostMediaItemSchema = z.object({
	type: z.enum(["image_v1", "album_v1"]),
	data: z.object({
		mediaId: z.int(),
		thumbnailUrl: mediaUrlSchema,
		fullImageUrl: mediaUrlSchema,
		shouldBlur: serverDefault({ value: z.boolean(), fallback: false }),
		isNsfw: serverDefault({ value: z.boolean(), fallback: false }),
	}),
});
export type RightNowPostMediaItem = z.infer<typeof rightNowPostMediaItemSchema>;

const rightNowPostMediaSchema = arrayOfParsableEntries({
	entries: rightNowPostMediaItemSchema,
	label: "right now post media",
});

const lockedPostKindSchema = knownValueOrNull({
	value: z.enum(["xtra_post_v1", "unlimited_post_v1"]),
	label: "right now locked post kind",
}).optional();

export const postDataSchema = z.object({
	id: z.int(),
	profileId: z.int().nonnegative(),
	mediaHash: mediaHashPublicSchema.optional(),
	displayName: z.string().optional(),
	media: rightNowPostMediaSchema,
	onlineUntil: unixTimestampMsSchema.optional(),
	text: z.string().optional(),
	distance: z.int().nonnegative().optional(),
	type: lockedPostKindSchema,
	hosting: z.boolean(),
	posted: unixTimestampMsSchema,
	expiration: unixTimestampMsSchema,
	recentlyChatted: z.boolean(),
	favorite: z.boolean(),
	lat: z.number().optional(),
	lon: z.number().optional(),
	isOnPrep: z.boolean().optional(),
});
export type PostData = z.infer<typeof postDataSchema>;

export const discreetPostDataSchema = z.object({
	id: z.int(),
	media: rightNowPostMediaSchema.optional(),
	onlineUntil: unixTimestampMsSchema.optional(),
	text: z.string().optional(),
	distance: z.int().nonnegative().optional(),
	lat: z.number().optional(),
	lon: z.number().optional(),
	type: lockedPostKindSchema,
	hosting: z.boolean(),
	posted: unixTimestampMsSchema,
	expiration: unixTimestampMsSchema,
	profileFields: z.object({
		age: z.int().nullable().default(null),
		height: z.number().nullable().default(null),
		weight: z.number().nullable().default(null),
		position: z.int().nullable().default(null),
	}),
});
export type DiscreetPostData = z.infer<typeof discreetPostDataSchema>;

export const curatedPostDataSchema = z.object({
	type: knownValueOrNull({
		value: z.enum([
			"tutorial_australia_v1",
			"tutorial_hosting_v1",
			"tutorial_dense_market_v1",
		]),
		label: "right now curated post kind",
	}).optional(),
});

export const upsellInsertDataSchema = z.object({
	type: knownValueOrNull({
		value: z.enum(["xtra_upsell_v1", "unlimited_upsell_v1"]),
		label: "right now upsell kind",
	}).optional(),
});

export const rightNowPostSchema = z.object({
	type: z.literal("right_now_post_v3"),
	data: postDataSchema,
});

export const lockedPostSchema = z.object({
	type: z.literal("locked_post_v1"),
	data: postDataSchema,
});

export const discreetPostSchema = z.object({
	type: z.literal("discreet_right_now_post_v1"),
	data: discreetPostDataSchema,
});

export const discreetLockedPostSchema = z.object({
	type: z.literal("discreet_locked_post_v1"),
	data: discreetPostDataSchema,
});

export const curatedPostSchema = z.object({
	type: z.literal("curated_post_v1"),
	data: curatedPostDataSchema.default({}),
});

export const upsellInsertSchema = z.object({
	type: z.literal("upsell_insert_v1"),
	data: upsellInsertDataSchema.default({}),
});

export const rightNowFeedResponseItemSchema = z.discriminatedUnion("type", [
	rightNowPostSchema,
	lockedPostSchema,
	discreetPostSchema,
	discreetLockedPostSchema,
	curatedPostSchema,
	upsellInsertSchema,
]);
export type RightNowFeedResponseItem = z.infer<
	typeof rightNowFeedResponseItemSchema
>;

export const rightNowFeedResponseSchema = z.object({
	items: arrayOfKnownVariants({
		variants: rightNowFeedResponseItemSchema,
		label: "right now feed",
	}),
	viewerCount: z.int().nonnegative(),
});
export type RightNowFeedResponse = z.infer<typeof rightNowFeedResponseSchema>;
