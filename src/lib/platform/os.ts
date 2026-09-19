import { isTauri } from "@tauri-apps/api/core";
import { type Platform, platform } from "@tauri-apps/plugin-os";

export function currentPlatform(): Platform | "web" {
	return isTauri() ? platform() : "web";
}

export function isMobilePlatform(): boolean {
	return isTauri() && ["android", "ios"].includes(platform());
}

export function isAndroidPlatform(): boolean {
	return isTauri() && platform() === "android";
}

export function isLinuxPlatform(): boolean {
	return isTauri() && platform() === "linux";
}

export function isMacosPlatform(): boolean {
	return isTauri() && platform() === "macos";
}
