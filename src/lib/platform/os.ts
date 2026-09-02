import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

export function isMobilePlatform(): boolean {
	return isTauri() && ["android", "ios"].includes(platform());
}

export function isAndroidPlatform(): boolean {
	return isTauri() && platform() === "android";
}

export function isLinuxPlatform(): boolean {
	return isTauri() && platform() === "linux";
}
