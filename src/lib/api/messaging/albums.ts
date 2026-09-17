import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { ApiError } from "$lib/api/api-error";
import {
	mediaFileDescriptor,
	type MediaFileInspection,
} from "$lib/api/media-file";
import { asAppError } from "$lib/api/methods";
import {
	decodeRestResponse,
	fetchRest,
	restInvokeError,
} from "$lib/api/transport";
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

export async function getAlbumStorageLimits() {
	return await fetchRest("/v1/albums/storage").then((res) =>
		res.jsonParsed(albumStorageLimitsSchema),
	);
}

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

const uploadOutcomeSchema = z.object({
	response: z.string(),
	sha256: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.nullable(),
	bodySize: z.int().nonnegative(),
});

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
	const path = `/v1/albums/${albumId}/content?${albumContentQuery(inspection)}isFresh=false`;
	const requestInfo = { method: "POST", path };
	try {
		const outcome = uploadOutcomeSchema.parse(
			await invoke("upload_media_file", {
				file: mediaFileDescriptor(media),
				request: {
					method: "POST",
					path,
					part: { name: "content", filename: "" },
				},
				maxBodySize: limits.maxContentSize,
				profileId: String(profileId),
			}),
		);
		if (outcome.sha256 !== null) onHashed?.(outcome.sha256);
		const { contentId } = decodeRestResponse({
			encoded: outcome.response,
			requestInfo,
		}).jsonParsed(albumContentUploadResponseSchema);
		return { contentId, sha256: outcome.sha256 };
	} catch (error) {
		throw restInvokeError({ error, requestInfo });
	}
}

export function albumMediaErrorMessage({
	error,
	limits,
}: {
	error: unknown;
	limits: Pick<AlbumStorageLimits, "maxContentSizeHumanReadable">;
}): string | null {
	const kind =
		error instanceof ApiError ? error.kind : asAppError(error)?.kind;
	const status =
		error instanceof ApiError ? (error.response?.status ?? null) : null;
	if (kind === "ContentTooLarge" || status === 413) {
		return `Larger than the ${limits.maxContentSizeHumanReadable} limit`;
	}
	return null;
}
