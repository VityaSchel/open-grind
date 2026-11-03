import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { invokeRest } from "#lib/api/transport.ts";
import { demoUploadRightNowPhoto } from "#lib/demo/index.ts";
import {
	type RightNowMediaUploadResponse,
	rightNowMediaUploadResponseSchema,
} from "#lib/model/right-now/post.ts";
import {
	localFileOf,
	type MediaFileDescriptor,
	mediaFileDescriptor,
} from "#lib/platform/media-file.ts";
import { stageFile } from "#lib/platform/media-intake.svelte.ts";
import type { PickedMedia } from "#lib/platform/media-picker.ts";

const UPLOAD_PATH = "/v2/media/upload";
const TOO_FEW_BYTES = "Bytes too few";

export class RightNowPhotoTooSmallError extends Error {
	constructor() {
		super("This photo is too small");
		this.name = "RightNowPhotoTooSmallError";
	}
}

async function uploadPhoto({
	file,
}: {
	file: MediaFileDescriptor;
}): Promise<RightNowMediaUploadResponse> {
	const response = await invokeRest("upload_media", {
		args: { path: UPLOAD_PATH, signed: false, file, crop: "cropAndThumb" },
		requestInfo: { method: "POST", path: UPLOAD_PATH },
	});
	if (response.status === 400 && response.text().includes(TOO_FEW_BYTES)) {
		throw new RightNowPhotoTooSmallError();
	}
	return response.jsonParsed(rightNowMediaUploadResponseSchema);
}

function demoUploadFile({ file }: { file: File }): RightNowMediaUploadResponse {
	return demoUploadRightNowPhoto({ url: URL.createObjectURL(file) });
}

export async function uploadRightNowPickedPhoto({
	media,
}: {
	media: PickedMedia;
}): Promise<RightNowMediaUploadResponse> {
	if (__DEMO__) {
		const file = localFileOf(media);
		if (file === null) {
			throw new Error("The demo only reads files picked in the browser");
		}
		return demoUploadFile({ file });
	}
	return uploadPhoto({ file: mediaFileDescriptor(media) });
}

export async function uploadRightNowPhoto({
	file,
}: {
	file: File;
}): Promise<RightNowMediaUploadResponse> {
	if (__DEMO__) return demoUploadFile({ file });
	return uploadRightNowPickedPhoto({ media: await stageFile(file) });
}

export async function uploadRightNowPhotoFromUrl({
	url,
}: {
	url: string;
}): Promise<RightNowMediaUploadResponse> {
	if (__DEMO__) return demoUploadRightNowPhoto({ url });
	const id = z.string().parse(await invoke("stage_proxied_photo", { url }));
	return uploadPhoto({ file: { source: "staged", id } });
}
