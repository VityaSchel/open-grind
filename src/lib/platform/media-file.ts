import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import type { PickedMedia } from "$lib/platform/media-picker";

const mediaFileKindSchema = z.enum(["photo", "video", "unsupported"]);

export type MediaFileKind = z.infer<typeof mediaFileKindSchema>;

const mediaFileInspectionSchema = z.object({
	kind: mediaFileKindSchema,
	size: z.int().nonnegative(),
	width: z.int().positive().optional(),
	height: z.int().positive().optional(),
	durationMs: z.int().nonnegative().optional(),
});

export type MediaFileInspection = z.infer<typeof mediaFileInspectionSchema>;

export function mediaFileKindOf(mimeType: string | null): MediaFileKind {
	if (mimeType?.startsWith("image/")) return "photo";
	if (mimeType?.startsWith("video/")) return "video";
	return "unsupported";
}

export function localFileOf(media: PickedMedia): File | null {
	if (media.source === "web") return media.file;
	if (media.source === "staged") return media.file ?? null;
	return null;
}

async function photoSizeOf(
	file: File,
): Promise<Pick<MediaFileInspection, "width" | "height">> {
	try {
		const bitmap = await createImageBitmap(file);
		const size = { width: bitmap.width, height: bitmap.height };
		bitmap.close();
		return size;
	} catch {
		return {};
	}
}

export async function inspectMediaFile(
	media: PickedMedia,
): Promise<MediaFileInspection> {
	if (media.source === "web") {
		const kind = mediaFileKindOf(media.file.type);
		return {
			kind,
			size: media.file.size,
			...(kind === "photo" ? await photoSizeOf(media.file) : {}),
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

const mediaPreviewSchema = z.object({
	dataUrl: z.string().startsWith("data:image/"),
	width: z.int().positive(),
	height: z.int().positive(),
});

export type MediaPreview = z.infer<typeof mediaPreviewSchema>;

function readDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") resolve(reader.result);
			else reject(new Error("Unreadable"));
		};
		reader.onerror = () => reject(reader.error ?? new Error("Unreadable"));
		reader.readAsDataURL(file);
	});
}

async function previewWebFile(file: File): Promise<MediaPreview | null> {
	if (mediaFileKindOf(file.type) !== "photo") return null;
	const dataUrl = await readDataUrl(file);
	const image = new Image();
	image.src = dataUrl;
	await image.decode();
	return mediaPreviewSchema.parse({
		dataUrl,
		width: image.naturalWidth,
		height: image.naturalHeight,
	});
}

export async function previewMedia(
	media: PickedMedia,
): Promise<MediaPreview | null> {
	if (media.source === "web") return previewWebFile(media.file);
	if (demoEnabled) return null;
	return mediaPreviewSchema
		.nullable()
		.parse(
			await invoke("preview_media", { file: mediaFileDescriptor(media) }),
		);
}

export async function discardStagedMedia(media: PickedMedia[]): Promise<void> {
	await Promise.all(
		media.map(async (item) => {
			if (item.source !== "staged") return;
			try {
				await invoke("discard_staged_media", { id: item.id });
			} catch (error) {
				console.error(error);
			}
		}),
	);
}

export type MediaFileDescriptor = ReturnType<typeof mediaFileDescriptor>;

export function mediaFileDescriptor(media: PickedMedia) {
	switch (media.source) {
		case "android":
			return { source: media.source, uri: media.uri };
		case "desktop":
			return { source: media.source, path: media.path };
		case "staged":
			return { source: media.source, id: media.id };
		case "web":
			throw new Error("A file picked in the browser has no native path");
	}
}
