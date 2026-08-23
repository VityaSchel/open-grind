import z from "zod";

import { mediaUrlSchema } from "$lib/model/media";
import { unixTimestampMsSchema } from "$lib/model/types";

export const albumPreviewSchema = z.object({
	albumId: z.int(),
	hasUnseenContent: z.boolean(),
});

export const albumMinSchema = albumPreviewSchema.extend({
	albumName: z.string().nullable(),
	profileId: z.int(),
	albumViewable: z.boolean(),
});

export const albumDetailsSchema = z.object({
	sharedCount: z.int(),
	createdAt: z.iso.datetime({ local: true }),
	updatedAt: z.iso.datetime({ local: true }),
});

export const AlbumExpiration = {
	INDEFINITE: 0,
	ONCE: 1,
	TEN_MINUTES: 2,
	ONE_HOUR: 3,
	ONE_DAY: 4,
} as const;

export const albumExpirationTypeSchema = z.enum(
	Object.keys(AlbumExpiration) as (keyof typeof AlbumExpiration)[],
);

export type AlbumExpirationType = z.infer<typeof albumExpirationTypeSchema>;

export const albumExpirationSchema = z.object({
	expiresAt: unixTimestampMsSchema.nullable(),
	expirationType: albumExpirationTypeSchema.optional().nullable(),
});

export const albumContentMin = z.object({
	contentId: z.int(),
	contentType: z.string(),
	coverUrl: mediaUrlSchema.nullable(),
	statusId: z.int(),
});

export const albumContentSchema = albumContentMin.extend({
	thumbUrl: mediaUrlSchema,
	url: mediaUrlSchema.or(z.literal("")),
	processing: z.boolean().nullable(),
	rejectionId: z.unknown().nullable(),
});

export const myAlbumSchema = albumDetailsSchema.extend({
	albumId: z.int(),
	albumName: z.string().nullable(),
	profileId: z.int(),
	version: z.int(),
	content: z.array(albumContentSchema),
	isShareable: z.boolean(),
});

export type MyAlbum = z.infer<typeof myAlbumSchema>;

export const myAlbumsResponseSchema = z.object({
	albums: z.array(myAlbumSchema),
});

export const albumShareRequestSchema = z.object({
	profiles: z.array(
		z.object({
			profileId: z.int(),
			expirationType: albumExpirationTypeSchema,
		}),
	),
});

export type AlbumShareRequest = z.infer<typeof albumShareRequestSchema>;

export const albumSharesResponseSchema = z.object({
	profileIds: z.array(z.int()),
});

export const albumUnshareRequestProfileItemSchema = z.object({
	profileId: z.int(),
	shareId: z.string(),
});

export const albumUnshareRequestSchema = z.object({
	profiles: z.array(albumUnshareRequestProfileItemSchema),
});

export type AlbumUnshareRequest = z.infer<typeof albumUnshareRequestSchema>;
