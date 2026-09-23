import { open } from "@tauri-apps/plugin-dialog";
import { AndroidFs, type AndroidFsUri } from "tauri-plugin-android-fs-api";

import { demoEnabled } from "$lib/demo";
import { isAndroidPlatform } from "$lib/platform/os";

type MediaFilter = { name: string; extensions: string[]; mimeTypes: string[] };

const mimeTypesByExtension: Record<string, string> = {
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	mov: "video/quicktime",
	mp4: "video/mp4",
	png: "image/png",
	webp: "image/webp",
};

const imageExtensions = ["jpg", "jpeg", "png", "webp"];

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

export type PickedMedia = { key: string; mimeType: string | null } & (
	| { source: "android"; uri: AndroidFsUri }
	| { source: "desktop"; path: string }
	| { source: "web"; file: File }
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
		const files = await pickWebFiles({ filter, multiple });
		return files.map(
			(file): PickedMedia => ({
				source: "web",
				key: crypto.randomUUID(),
				mimeType: file.type === "" ? null : file.type,
				file,
			}),
		);
	}

	if (isAndroidPlatform()) {
		const uris = await AndroidFs.showOpenFilePicker({
			pickerType: "Gallery",
			mimeTypes: filter.mimeTypes,
			multiple,
		});
		return uris.map(
			(uri): PickedMedia => ({
				source: "android",
				key: crypto.randomUUID(),
				mimeType: null,
				uri,
			}),
		);
	}

	const filters = [{ name: filter.name, extensions: filter.extensions }];
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

function mimeTypeFromPath(path: string): string | null {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return mimeTypesByExtension[extension] ?? null;
}

function pickWebFiles({
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
