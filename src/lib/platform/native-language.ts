import { invoke } from "@tauri-apps/api/core";

import { getCatalogLocale } from "$lib/i18n";
import { pickerTag } from "$lib/i18n/matcher";
import type { LanguageSyncTier } from "./language-sync";
import { isAndroidPlatform } from "./os";

const WRITE_COMMAND = "set_native_language";

let published: string | null | undefined;
let sending: Promise<void> = Promise.resolve();

async function send(tag: string | null): Promise<void> {
	try {
		await invoke(WRITE_COMMAND, { tag });
	} catch (error) {
		if (published === tag) published = undefined;
		console.error("Failed to set the native text language", error);
	}
}

function publish(tag: string | null): Promise<void> {
	if (!isAndroidPlatform() || tag === published) return sending;
	published = tag;
	sending = sending.then(() => send(tag));
	return sending;
}

export function publishNativeLanguage({
	choice,
	tier,
}: {
	choice: string | null;
	tier: LanguageSyncTier;
}): Promise<void> {
	return publish(
		tier !== "two-way" && choice !== null
			? pickerTag(getCatalogLocale())
			: null,
	);
}

export function publishPinnedNativeLanguage(): Promise<void> {
	return publish(pickerTag(getCatalogLocale()));
}
