import { invoke } from "@tauri-apps/api/core";

import { currentPlatform } from "$lib/platform/os";

export function canOpenAppSettings(): boolean {
	switch (currentPlatform()) {
		case "android":
			return true;
		case "ios":
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}

export function openAppSettings(): void {
	if (!canOpenAppSettings()) return;
	void invoke("open_app_settings").catch(console.error);
}
