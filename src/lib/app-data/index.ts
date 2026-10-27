import { invoke } from "@tauri-apps/api/core";

import { toBase64 } from "$lib/util/base64";

const nativeFiles = {
	"preferences.data": "preferences",
	"honduras-hold.data": "hondurasHold",
} as const;

type AppDataPath = keyof typeof nativeFiles;

async function readNativeFile(path: AppDataPath) {
	const bytes = await invoke<ArrayBuffer | number[] | null>("read_app_data", {
		file: nativeFiles[path],
	});
	return bytes === null ? null : new Uint8Array(bytes);
}

export async function existsAppDataFile(path: AppDataPath) {
	return (await readNativeFile(path)) !== null;
}

export async function readAppDataFile(path: AppDataPath) {
	const bytes = await readNativeFile(path);
	if (bytes === null) throw new Error(`No app data file at ${path}`);
	return bytes;
}

export async function removeAppDataFile(path: AppDataPath) {
	await invoke("remove_app_data", { file: nativeFiles[path] });
}

export async function writeAppDataFileAtomic({
	path,
	content,
}: {
	path: AppDataPath;
	content: Uint8Array;
}) {
	await invoke("write_app_data", {
		file: nativeFiles[path],
		content: toBase64(content),
	});
}
