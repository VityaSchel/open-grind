import { invoke } from "@tauri-apps/api/core";

import { isAndroidPlatform } from "$lib/platform/os";

export function canOpenAppSettings(): boolean {
	return isAndroidPlatform();
}

export function openAppSettings(): void {
	if (!isAndroidPlatform()) return;
	void invoke("open_app_settings").catch(console.error);
}
