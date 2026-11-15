import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "svelte-sonner";
import { AndroidFs, type AndroidFsUri } from "tauri-plugin-android-fs-api";
import z from "zod";

import { currentPlatform } from "#lib/platform/os.ts";

type MediaFilter = { name: string; extensions: string[]; mimeTypes: string[] };

const mimeTypesByExtension: Record<string, string> = {
	heic: "image/heic",
	heif: "image/heif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	mov: "video/quicktime",
	mp4: "video/mp4",
	png: "image/png",
	webp: "image/webp",
};

const imageExtensions = ["jpg", "jpeg", "png", "webp"];

const heifExtensions = ["heic", "heif"];

const videoExtensions = ["mp4", "mov"];

const filtersByKind = {
	image: {
		name: "Images",
		extensions: imageExtensions,
		mimeTypes: ["image/*"],
	},
	video: {
		name: "Videos",
		extensions: videoExtensions,
		mimeTypes: ["video/*"],
	},
	media: {
		name: "Media",
		extensions: [...imageExtensions, ...videoExtensions],
		mimeTypes: ["image/*", "video/*"],
	},
} satisfies Record<string, MediaFilter>;

export type MediaKind = keyof typeof filtersByKind;

const iosPicksSchema = z.object({
	ids: z.array(z.string()),
	failed: z.number().int().nonnegative(),
});

export type PickedMedia = { key: string; mimeType: string | null } & (
	| { source: "android"; uri: AndroidFsUri }
	| { source: "desktop"; path: string }
	| { source: "staged"; id: string; file?: File }
	| { source: "demo"; file: File }
);

export async function pickMedia(kind: MediaKind): Promise<PickedMedia | null> {
	const picked = await pick({ kind, multiple: false });
	return picked[0] ?? null;
}

export function pickMultipleMedia(kind: MediaKind): Promise<PickedMedia[]> {
	return pick({ kind, multiple: true });
}

async function pick({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	if (__DEMO__) return pickDemoMedia({ kind, multiple });

	switch (currentPlatform()) {
		case "android":
			return pickAndroidMedia({ kind, multiple });
		case "ios":
			return pickIosMedia({ kind, multiple });
		case "linux":
		case "windows":
			return pickWithDialog({ kind, multiple, decodesHeif: false });
		case "macos":
			return pickWithDialog({ kind, multiple, decodesHeif: true });
	}
}

async function pickIosMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const { ids, failed } = iosPicksSchema.parse(
		await invoke("pick_ios_media", { kind, multiple }),
	);
	if (failed > 0) toast.error(`Couldn't load ${failed} of the picked items`);
	return ids.map(
		(id): PickedMedia => ({
			source: "staged",
			key: crypto.randomUUID(),
			mimeType: null,
			id,
		}),
	);
}

async function pickWithDialog({
	kind,
	multiple,
	decodesHeif,
}: {
	kind: MediaKind;
	multiple: boolean;
	decodesHeif: boolean;
}): Promise<PickedMedia[]> {
	const { name, extensions } = filtersByKind[kind];
	const offered =
		decodesHeif && kind !== "video"
			? [...extensions, ...heifExtensions]
			: extensions;
	const filters = [{ name, extensions: offered }];
	const selection = multiple
		? await open({ filters, multiple: true })
		: await open({ filters, multiple: false });
	const paths =
		selection === null
			? []
			: Array.isArray(selection)
				? selection
				: [selection];
	return paths.map(
		(path): PickedMedia => ({
			source: "desktop",
			key: crypto.randomUUID(),
			mimeType: mimeTypeFromPath(path),
			path,
		}),
	);
}

async function pickAndroidMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const { mimeTypes } = filtersByKind[kind];
	const picked = await invoke<string[] | null>("pick_android_media", {
		mimeTypes,
		multiple,
	});
	const uris =
		picked === null
			? await AndroidFs.showOpenFilePicker({
					pickerType: "Gallery",
					mimeTypes,
					multiple,
				})
			: picked.map(
					(uri): AndroidFsUri => ({ uri, documentTopTreeUri: null }),
				);
	return uris.map(
		(uri): PickedMedia => ({
			source: "android",
			key: crypto.randomUUID(),
			mimeType: null,
			uri,
		}),
	);
}

export function mimeTypeFromPath(path: string): string | null {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return mimeTypesByExtension[extension] ?? null;
}

async function pickDemoMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const files = await new Promise<File[]>((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = filtersByKind[kind].mimeTypes.join(",");
		input.multiple = multiple;
		input.onchange = () => resolve(Array.from(input.files ?? []));
		input.oncancel = () => resolve([]);
		input.click();
	});
	return files.map(
		(file): PickedMedia => ({
			source: "demo",
			key: crypto.randomUUID(),
			mimeType: file.type === "" ? null : file.type,
			file,
		}),
	);
}
