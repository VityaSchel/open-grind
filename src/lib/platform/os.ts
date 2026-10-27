import { platform } from "@tauri-apps/plugin-os";

export type SupportedPlatform =
	| "android"
	| "ios"
	| "linux"
	| "macos"
	| "windows";

export const platformNames = {
	android: "Android",
	ios: "iOS",
	linux: "Linux",
	macos: "macOS",
	windows: "Windows",
} as const satisfies Record<SupportedPlatform, string>;

export function currentPlatform(): SupportedPlatform {
	const host = platform();
	switch (host) {
		case "android":
		case "ios":
		case "linux":
		case "macos":
		case "windows":
			return host;
		case "dragonfly":
		case "freebsd":
		case "netbsd":
		case "openbsd":
		case "solaris":
			throw new Error(`Open Grind does not support ${host}`);
	}
}

export function isMobilePlatform(): boolean {
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

export function isDesktopPlatform(): boolean {
	switch (currentPlatform()) {
		case "android":
		case "ios":
			return false;
		case "linux":
		case "macos":
		case "windows":
			return true;
	}
}
