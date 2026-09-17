import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import type { PickedMedia } from "$lib/platform/media-picker";

export const mediaFileKindSchema = z.enum(["photo", "video", "unsupported"]);

export type MediaFileKind = z.infer<typeof mediaFileKindSchema>;

export const mediaFileInspectionSchema = z.object({
	kind: mediaFileKindSchema,
	size: z.int().nonnegative(),
	width: z.int().positive().optional(),
	height: z.int().positive().optional(),
});

export type MediaFileInspection = z.infer<typeof mediaFileInspectionSchema>;

export function mediaFileKindOf(mimeType: string | null): MediaFileKind {
	if (mimeType?.startsWith("image/")) return "photo";
	if (mimeType?.startsWith("video/")) return "video";
	return "unsupported";
}

export async function inspectMediaFile(
	media: PickedMedia,
): Promise<MediaFileInspection> {
	if (media.source === "web") {
		return {
			kind: mediaFileKindOf(media.file.type),
			size: media.file.size,
		};
	}
	if (demoEnabled) {
		return { kind: mediaFileKindOf(media.mimeType), size: 0 };
	}
	return mediaFileInspectionSchema.parse(
		await invoke("inspect_media_file", {
			file: mediaFileDescriptor(media),
		}),
	);
}

export type NativeMedia = Exclude<PickedMedia, { source: "web" }>;

export function mediaFileDescriptor(media: NativeMedia) {
	switch (media.source) {
		case "android":
			return { source: media.source, uri: media.uri };
		case "desktop":
			return { source: media.source, path: media.path };
	}
}
