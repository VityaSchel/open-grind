import { isTauri } from "@tauri-apps/api/core";
import { appLocalDataDir } from "@tauri-apps/api/path";
import {
	BaseDirectory,
	exists,
	mkdir,
	readFile,
	remove,
	rename,
	writeFile,
} from "@tauri-apps/plugin-fs";

import {
	existsWebAppDataFile,
	readWebAppDataFile,
	removeWebAppDataFile,
	writeWebAppDataFile,
} from "./web-store";

export async function existsAppDataFile(path: string) {
	if (!isTauri()) return existsWebAppDataFile(path);
	return await exists(path, { baseDir: BaseDirectory.AppLocalData });
}

export async function readAppDataFile(path: string) {
	if (!isTauri()) return readWebAppDataFile(path);
	return await readFile(path, { baseDir: BaseDirectory.AppLocalData });
}

export async function removeAppDataFile(path: string) {
	if (!isTauri()) return removeWebAppDataFile(path);
	if (!(await existsAppDataFile(path))) return;
	await remove(path, { baseDir: BaseDirectory.AppLocalData });
}

export async function writeAppDataFileAtomic({
	path,
	content,
}: {
	path: string;
	content: Uint8Array;
}) {
	if (!isTauri()) return writeWebAppDataFile({ path, content });
	await mkdir(await appLocalDataDir(), { recursive: true });
	const tempPath = `${path}.tmp`;
	await writeFile(tempPath, content, { baseDir: BaseDirectory.AppLocalData });
	await rename(tempPath, path, {
		oldPathBaseDir: BaseDirectory.AppLocalData,
		newPathBaseDir: BaseDirectory.AppLocalData,
	});
}
