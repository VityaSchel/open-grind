import { invoke } from "@tauri-apps/api/core";

import { currentPlatform } from "#lib/platform/os.ts";

export function canOpenAppSettings(): boolean {
	switch (currentPlatform()) {
		case "android":
		case "ios":
			return true;
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
