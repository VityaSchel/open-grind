import z from "zod";

import { signedInProfileId } from "$lib/api/current-session";
import { invokeRest, uploadFileRest } from "$lib/api/transport";
import { demoEnabled, demoUploadChatMedia } from "$lib/demo";
import { mediaUrlSchema } from "$lib/model/media";
import {
	inspectMediaFile,
	mediaFileDescriptor,
	type MediaFileInspection,
} from "$lib/platform/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";
import { type DrawerMedia, saveMediaToDrawer } from "./drawer";

export const CHAT_MEDIA_MAX_BYTES = 120 * 1024 * 1024;
export const CHAT_MEDIA_MAX_LABEL = "120.00 MB";

const VIDEO_CONTENT_TYPE = "video/mp4";
const PHOTO_CONTENT_TYPE = "image/jpeg";

const mediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: mediaUrlSchema,
	mediaHash: z.string(),
});

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

export class UnsupportedChatMediaError extends Error {
	constructor() {
		super("That file isn't a photo or video");
		this.name = "UnsupportedChatMediaError";
	}
}

function chatMediaUploadPath({
	takenOnGrindr,
	inspection,
}: {
	takenOnGrindr: boolean;
	inspection: MediaFileInspection;
}): string {
	if (takenOnGrindr) return "/v6/chat/media/upload?takenOnGrindr=true";
	const query = new URLSearchParams({ takenOnGrindr: "false" });
	if (inspection.kind === "video") {
		if (inspection.durationMs !== undefined) {
			query.set("length", String(inspection.durationMs));
		}
		query.set("looping", "false");
	}
	return `/v5/chat/media/upload?${query}`;
}

async function uploadChatMedia({
	media,
	inspection,
	contentType,
	takenOnGrindr,
}: {
	media: PickedMedia;
	inspection: MediaFileInspection;
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
	const file = mediaFileDescriptor(media);
	const path = chatMediaUploadPath({ takenOnGrindr, inspection });
	if (takenOnGrindr) {
		const response = await invokeRest("upload_media", {
			args: { path, signed: true, file },
			requestInfo: { method: "POST", path },
		});
		return response.jsonParsed(mediaUploadResponseSchema);
	}
	const profileId = await signedInProfileId();
	if (profileId === null) throw new Error("Not signed in");
	const { response } = await uploadFileRest(path, {
		file,
		part: null,
		maxBodySize: CHAT_MEDIA_MAX_BYTES,
		profileId,
	});
	return response.jsonParsed(mediaUploadResponseSchema);
}

function uploadedContentType({
	media,
	inspection,
}: {
	media: PickedMedia;
	inspection: MediaFileInspection;
}): string {
	const fallback =
		inspection.kind === "video" ? VIDEO_CONTENT_TYPE : PHOTO_CONTENT_TYPE;
	return media.source === "web" ? (media.mimeType ?? fallback) : fallback;
}

export async function addMediaToDrawer(
	media: PickedMedia,
): Promise<DrawerMedia> {
	const takenOnGrindr = false;
	const inspection = await inspectMediaFile(media);
	if (inspection.kind === "unsupported") {
		throw new UnsupportedChatMediaError();
	}
	const contentType = uploadedContentType({ media, inspection });
	const uploaded = await uploadChatMedia({
		media,
		inspection,
		contentType,
		takenOnGrindr,
	});
	try {
		await saveMediaToDrawer(uploaded.mediaId);
	} catch (error) {
		if (inspection.kind !== "video") throw error;
		console.error(error);
	}

	return {
		id: uploaded.mediaId,
		url: uploaded.url,
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr,
	};
}
