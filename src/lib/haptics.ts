import { invoke } from "@tauri-apps/api/core";

import {
	preferencesLoaded,
	preferencesSnapshot,
} from "$lib/app-data/preferences.svelte";
import { currentPlatform } from "$lib/platform/os";

export type HapticKind = "longPress" | "threshold" | "dragStart";

export function hapticsAvailable(): boolean {
	switch (currentPlatform()) {
		case "android":
		case "macos":
			return true;
		case "ios":
		case "linux":
		case "windows":
			return false;
	}
}

export function playHaptic(kind: HapticKind): void {
	if (!hapticsAvailable()) return;
	if (!preferencesLoaded()) return;
	if (!preferencesSnapshot().hapticFeedback) return;
	void invoke("play_haptic", { kind }).catch(console.error);
}
