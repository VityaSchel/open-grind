import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "svelte-sonner";
import { AndroidFs, type AndroidFsUri } from "tauri-plugin-android-fs-api";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import { currentPlatform } from "$lib/platform/os";

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
	picks: z.array(z.object({ id: z.string() })),
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
	const filter = filtersByKind[kind];

	if (demoEnabled) {
		const files = await pickDemoFiles({ filter, multiple });
		return files.map(
			(file): PickedMedia => ({
				source: "demo",
				key: crypto.randomUUID(),
				mimeType: file.type === "" ? null : file.type,
				file,
			}),
		);
	}

	switch (currentPlatform()) {
		case "android": {
			const uris = await pickAndroidUris({ filter, multiple });
			return uris.map(
				(uri): PickedMedia => ({
					source: "android",
					key: crypto.randomUUID(),
					mimeType: null,
					uri,
				}),
			);
		}
		case "ios":
			return pickIosMedia({ kind, multiple });
		case "linux":
		case "macos":
		case "windows":
			return pickWithDialog({ kind, multiple });
	}
}

async function pickIosMedia({
	kind,
	multiple,
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const { picks, failed } = iosPicksSchema.parse(
		await invoke("pick_ios_media", { kind, multiple }),
	);
	if (failed > 0) toast.error(`Couldn't load ${failed} of the picked items`);
	return picks.map(
		({ id }): PickedMedia => ({
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
}: {
	kind: MediaKind;
	multiple: boolean;
}): Promise<PickedMedia[]> {
	const filters = [
		{ name: filtersByKind[kind].name, extensions: dialogExtensions(kind) },
	];
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

function dialogExtensions(kind: MediaKind): string[] {
	const { extensions } = filtersByKind[kind];
	switch (currentPlatform()) {
		case "macos":
			return kind === "video"
				? extensions
				: [...extensions, ...heifExtensions];
		case "android":
		case "ios":
		case "linux":
		case "windows":
			return extensions;
	}
}

async function pickAndroidUris({
	filter,
	multiple,
}: {
	filter: MediaFilter;
	multiple: boolean;
}): Promise<AndroidFsUri[]> {
	const picked = await invoke<string[] | null>("pick_android_media", {
		mimeTypes: filter.mimeTypes,
		multiple,
	});
	if (picked !== null) {
		return picked.map(
			(uri): AndroidFsUri => ({ uri, documentTopTreeUri: null }),
		);
	}
	return AndroidFs.showOpenFilePicker({
		pickerType: "Gallery",
		mimeTypes: filter.mimeTypes,
		multiple,
	});
}

export function mimeTypeFromPath(path: string): string | null {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return mimeTypesByExtension[extension] ?? null;
}

function pickDemoFiles({
	filter,
	multiple,
}: {
	filter: MediaFilter;
	multiple: boolean;
}): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = filter.mimeTypes.join(",");
		input.multiple = multiple;
		input.onchange = () => resolve(Array.from(input.files ?? []));
		input.oncancel = () => resolve([]);
		input.click();
	});
}
