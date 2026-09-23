import z from "zod";

import { invokeRest } from "$lib/api/transport";
import { demoEnabled, demoUploadChatMedia } from "$lib/demo";
import { mediaUrlSchema } from "$lib/model/media";
import { mediaFileDescriptor } from "$lib/platform/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";
import { type DrawerMedia, saveMediaToDrawer } from "./drawer";

const mediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: mediaUrlSchema,
	mediaHash: z.string(),
});

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

function chatMediaUploadPath(takenOnGrindr: boolean): string {
	return takenOnGrindr
		? "/v6/chat/media/upload?takenOnGrindr=true"
		: "/v5/chat/media/upload?takenOnGrindr=false";
}

async function uploadChatMedia({
	media,
	contentType,
	takenOnGrindr,
}: {
	media: PickedMedia;
	contentType: string;
	takenOnGrindr: boolean;
}): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		if (media.source !== "web") {
			throw new Error("The demo only reads files picked in the browser");
		}
		return demoUploadChatMedia({
			bytes: new Uint8Array(await media.file.arrayBuffer()),
			contentType,
		});
	}
	if (media.source === "web") {
		throw new Error("A file picked in the browser has no native path");
	}
	const path = chatMediaUploadPath(takenOnGrindr);
	const response = await invokeRest("upload_media", {
		args: { path, signed: takenOnGrindr, file: mediaFileDescriptor(media) },
		requestInfo: { method: "POST", path },
	});
	return response.jsonParsed(mediaUploadResponseSchema);
}

export async function addMediaToDrawer(
	media: PickedMedia,
): Promise<DrawerMedia> {
	const takenOnGrindr = false;
	const contentType =
		media.source === "web"
			? (media.mimeType ?? "image/jpeg")
			: "image/jpeg";
	const uploaded = await uploadChatMedia({
		media,
		contentType,
		takenOnGrindr,
	});
	await saveMediaToDrawer(uploaded.mediaId);

	return {
		id: uploaded.mediaId,
		url: uploaded.url,
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr,
	};
}
