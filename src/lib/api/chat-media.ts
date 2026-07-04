import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { toBase64 } from "$lib/base64";
import { demoEnabled, demoUploadChatMedia } from "$lib/demo";
import { type PickedMedia, readMediaBytes } from "$lib/media-picker";
import { type DrawerMedia, saveMediaToDrawer } from "./media-drawer";

const mediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: z.url(),
	mediaHash: z.string(),
});

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

async function uploadChatMedia(
	bytes: Uint8Array<ArrayBuffer>,
	contentType: string,
): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		return demoUploadChatMedia(bytes, contentType);
	}
	const response = await invoke("upload_chat_media", {
		contentType,
		takenOnGrindr: false,
		data: toBase64(bytes),
	});
	return mediaUploadResponseSchema.parse(response);
}

/**
 * Uploads a picked media file and saves it to the conversation's media drawer
 * without sending it, mirroring the official app (`uploadMediaV2` followed by
 * `PUT /v4/chat/media/drawer/{mediaId}`). Returns the drawer item to insert
 * optimistically into the grid.
 */
export async function addMediaToDrawer(
	media: PickedMedia,
): Promise<DrawerMedia> {
	const bytes = await readMediaBytes(media);
	const contentType = media.mimeType ?? "image/jpeg";
	const uploaded = await uploadChatMedia(bytes, contentType);
	await saveMediaToDrawer(uploaded.mediaId);

	return {
		id: uploaded.mediaId,
		url: uploaded.url,
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr: false,
	};
}
