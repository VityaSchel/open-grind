import { invoke } from "@tauri-apps/api/core";

import {
	preferencesLoaded,
	preferencesSnapshot,
} from "$lib/app-data/preferences.svelte";
import { isAndroidPlatform, isMacosPlatform } from "$lib/platform/os";

export type HapticKind = "longPress" | "threshold" | "dragStart";

export function hapticsAvailable(): boolean {
	return isAndroidPlatform() || isMacosPlatform();
}

export function playHaptic(kind: HapticKind): void {
	if (!hapticsAvailable()) return;
	if (!preferencesLoaded()) return;
	if (!preferencesSnapshot().hapticFeedback) return;
	void invoke("play_haptic", { kind }).catch(console.error);
}
