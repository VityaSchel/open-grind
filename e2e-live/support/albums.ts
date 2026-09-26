import z from "zod";
import type { Page } from "@playwright/test";

import { appRequest } from "./app";

const myAlbumsSchema = z.object({
	albums: z.array(
		z.object({
			albumId: z.coerce.string(),
			albumName: z.string().nullish(),
			isShareable: z.boolean(),
			content: z.array(z.unknown()),
		}),
	),
});

const albumLimitsSchema = z.object({
	maxAlbums: z.number(),
	maxContentItemsPerAlbum: z.number(),
});

const albumContentSchema = z.object({
	content: z.array(z.object({ contentId: z.coerce.string() })),
});

async function getJson({ page, path }: { page: Page; path: string }) {
	return (await appRequest({ page, method: "GET", path })).json();
}

export async function myAlbums(page: Page) {
	return myAlbumsSchema.parse(await getJson({ page, path: "/v1/albums" }))
		.albums;
}

export async function albumLimits(page: Page) {
	return albumLimitsSchema.parse(
		await getJson({ page, path: "/v1/albums/storage" }),
	);
}

export async function albumContentIds({
	page,
	albumId,
}: {
	page: Page;
	albumId: string;
}) {
	return albumContentSchema
		.parse(await getJson({ page, path: `/v2/albums/${albumId}` }))
		.content.map(({ contentId }) => contentId);
}
