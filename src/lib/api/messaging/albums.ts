import z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	type AlbumContentOrderRequest,
	albumContentSchema,
	albumDetailsSchema,
	type AlbumExpirationType,
	albumMinSchema,
	type AlbumNameRequest,
	albumNameResponseSchema,
	type AlbumShareRequest,
	albumSharesResponseSchema,
	type AlbumUnshareRequest,
	myAlbumsResponseSchema,
} from "$lib/model/messaging/albums";

const albumResponseSchema = z.object({
	...albumMinSchema.shape,
	...albumDetailsSchema.shape,
	content: z.array(
		z.object({
			...albumContentSchema.shape,
			remainingViews: z.int().optional(),
		}),
	),
});

export async function getAlbumContent(albumId: number) {
	return await fetchRest(`/v2/albums/${albumId}`).then((res) =>
		res.jsonParsed(albumResponseSchema),
	);
}

export type AlbumContentResponse = Awaited<ReturnType<typeof getAlbumContent>>;

export async function getMyAlbums() {
	return await fetchRest("/v1/albums").then((res) =>
		res.jsonParsed(myAlbumsResponseSchema),
	);
}

export async function shareAlbum({
	albumId,
	profileIds,
	expirationType = "INDEFINITE",
}: {
	albumId: number;
	profileIds: number[];
	expirationType?: AlbumExpirationType;
}) {
	await fetchRest(`/v4/albums/${albumId}/shares`, {
		method: "POST",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				expirationType,
			})),
		} satisfies AlbumShareRequest,
	}).then((res) => res.assertOk());
}

export async function getAlbumShares(albumId: number) {
	return await fetchRest(`/v1/albums/${albumId}/shares`).then((res) =>
		res.jsonParsed(albumSharesResponseSchema),
	);
}

export async function unshareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}) {
	await fetchRest(`/v1/albums/${albumId}/unshares`, {
		method: "PUT",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				shareId: crypto.randomUUID(),
			})),
		} satisfies AlbumUnshareRequest,
	}).then((res) => res.assertOk());
}

export async function createAlbum({
	albumName = null,
}: { albumName?: string | null } = {}) {
	return await fetchRest("/v2/albums", {
		method: "POST",
		body: { albumName } satisfies AlbumNameRequest,
	}).then((res) => res.jsonParsed(albumNameResponseSchema));
}

export async function renameAlbum({
	albumId,
	albumName,
}: {
	albumId: number;
	albumName: string | null;
}) {
	return await fetchRest(`/v2/albums/${albumId}`, {
		method: "PUT",
		body: { albumName } satisfies AlbumNameRequest,
	}).then((res) => res.jsonParsed(albumNameResponseSchema));
}

export async function deleteAlbum({ albumId }: { albumId: number }) {
	await fetchRest(`/v1/albums/${albumId}`, { method: "DELETE" }).then((res) =>
		res.assertOk(),
	);
}

export async function deleteAlbumContent({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}) {
	await fetchRest(`/v1/albums/${albumId}/content/${contentId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

export async function reorderAlbumContent({
	albumId,
	contentIds,
}: {
	albumId: number;
	contentIds: number[];
}) {
	await fetchRest(`/v1/albums/${albumId}/content/order`, {
		method: "POST",
		body: { contentIds } satisfies AlbumContentOrderRequest,
	}).then((res) => res.assertOk());
}
