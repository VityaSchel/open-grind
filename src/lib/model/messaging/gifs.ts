import z from "zod";

import { arrayOfParsableEntries } from "$lib/model/tolerance";
import type { OutboundMessage } from "$lib/model/messaging/messages";

const IMAGE_HASH_PREFIX = "giphy/";

export const GIPHY_MEDIA_HOST = /^media[0-4]?\.giphy\.com$/;

const giphyMediaUrlSchema = z.url({
	protocol: /^https$/,
	hostname: GIPHY_MEDIA_HOST,
});

const giphyDimensionSchema = z
	.string()
	.regex(/^[1-9]\d*$/)
	.transform(Number);

export const giphyRenditionSchema = z.object({
	url: giphyMediaUrlSchema.optional(),
	width: giphyDimensionSchema.optional(),
	height: giphyDimensionSchema.optional(),
	webp: giphyMediaUrlSchema.optional(),
});

export type GiphyRendition = z.infer<typeof giphyRenditionSchema>;

const giphyTileRenditionSchema = z.union([
	giphyRenditionSchema.required({ webp: true }),
	giphyRenditionSchema.extend({
		url: giphyMediaUrlSchema,
		webp: z.undefined().optional(),
	}),
]);

export const giphyImagesSchema = z.object({
	fixed_width_downsampled: giphyTileRenditionSchema,
	fixed_height: giphyRenditionSchema.required({
		url: true,
		width: true,
		height: true,
	}),
	fixed_height_still: giphyRenditionSchema.required({ url: true }),
});

export const giphyGifSchema = z.object({
	id: z.string().regex(/\S/),
	title: z.string().optional(),
	alt_text: z.string().optional(),
	images: giphyImagesSchema,
});

export type GiphyGif = z.infer<typeof giphyGifSchema>;

export const giphyPaginationSchema = z.object({
	total_count: z.int().nonnegative(),
	count: z.int().nonnegative(),
	offset: z.int().nonnegative(),
});

export type GiphyPagination = z.infer<typeof giphyPaginationSchema>;

export const giphyMetaSchema = z.object({
	status: z.int().optional(),
	msg: z.string().optional(),
});

export const giphyResponseSchema = z.object({
	data: arrayOfParsableEntries({
		entries: giphyGifSchema,
		label: "giphy data",
	}),
	pagination: giphyPaginationSchema.optional(),
	meta: giphyMetaSchema.optional(),
});

export type GiphyResponse = z.infer<typeof giphyResponseSchema>;

export type GiphyBody = Extract<OutboundMessage, { type: "Giphy" }>["body"];

export function giphyBody({
	id,
	urlPath,
	stillPath,
	width,
	height,
}: Omit<GiphyBody, "previewPath" | "imageHash">): GiphyBody {
	return {
		id,
		urlPath,
		previewPath: urlPath,
		stillPath,
		width,
		height,
		imageHash: `${IMAGE_HASH_PREFIX}${id}`,
	};
}
