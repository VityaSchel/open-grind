import z from "zod";

import { cachedFetch } from "$lib/api/cache";
import { fetchRest, uploadFileRest } from "$lib/api/transport";
import { demoEnabled, demoUploadAlbumContent } from "$lib/demo";
import {
	type AlbumContentOrderRequest,
	albumContentProcessingResponseSchema,
	albumContentSchema,
	albumContentUploadResponseSchema,
	albumDetailsSchema,
	type AlbumExpirationType,
	albumMinSchema,
	type AlbumNameRequest,
	albumNameResponseSchema,
	type AlbumShareRequest,
	albumSharesResponseSchema,
	type AlbumStorageLimits,
	albumStorageLimitsSchema,
	type AlbumUnshareRequest,
	myAlbumsResponseSchema,
} from "$lib/model/messaging/albums";
import {
	mediaFileDescriptor,
	type MediaFileInspection,
} from "$lib/platform/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";

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

export const getAlbumStorageLimits = cachedFetch(() =>
	fetchRest("/v1/albums/storage").then((res) =>
		res.jsonParsed(albumStorageLimitsSchema),
	),
);

export async function getAlbumContentProcessing({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}) {
	return await fetchRest(
		`/v1/albums/${albumId}/content/${contentId}/processing`,
	).then((res) => res.jsonParsed(albumContentProcessingResponseSchema));
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

function albumContentQuery(inspection: MediaFileInspection): string {
	if (inspection.kind !== "video") return "";
	const { width, height } = inspection;
	if (width === undefined || height === undefined) return "";
	return `width=${width}&height=${height}&`;
}

export async function uploadAlbumContent({
	albumId,
	media,
	inspection,
	limits,
	profileId,
	onHashed,
}: {
	albumId: number;
	media: PickedMedia;
	inspection: MediaFileInspection;
	limits: Pick<AlbumStorageLimits, "maxContentSize">;
	profileId: number;
	onHashed?: (sha256: string) => void;
}): Promise<{ contentId: number; sha256: string | null }> {
	if (demoEnabled) {
		const uploaded = demoUploadAlbumContent({
			albumId,
			kind: inspection.kind,
		});
		onHashed?.(uploaded.sha256);
		return uploaded;
	}
	if (media.source === "web") {
		throw new Error("A file picked in the browser has no native path");
	}
	const { response, sha256 } = await uploadFileRest(
		`/v1/albums/${albumId}/content?${albumContentQuery(inspection)}isFresh=false`,
		{
			file: mediaFileDescriptor(media),
			part: { name: "content", filename: "" },
			maxBodySize: limits.maxContentSize,
			profileId,
			onHashed,
		},
	);
	const { contentId } = response.jsonParsed(albumContentUploadResponseSchema);
	return { contentId, sha256 };
}
