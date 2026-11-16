import { invoke } from "@tauri-apps/api/core";

import { getCatalogLocale } from "#lib/i18n/index.ts";
import { pickerTag } from "#lib/i18n/matcher.ts";
import { currentPlatform } from "./os";

const WRITE_COMMAND = "set_native_language";

let sending: Promise<void> = Promise.resolve();

async function send(tag: string): Promise<void> {
	try {
		await invoke(WRITE_COMMAND, { tag });
	} catch (error) {
		console.error("Failed to set the native text language", error);
	}
}

function showsNativeText(): boolean {
	switch (currentPlatform()) {
		case "android":
		case "macos":
		case "windows":
		case "linux":
		case "freebsd":
		case "dragonfly":
		case "netbsd":
		case "openbsd":
		case "solaris":
			return true;
		case "ios":
		case "web":
			return false;
	}
}

export function publishNativeLanguage(): Promise<void> {
	if (!showsNativeText()) return sending;
	const tag = pickerTag(getCatalogLocale());
	sending = sending.then(() => send(tag));
	return sending;
}
