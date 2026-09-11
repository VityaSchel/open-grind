import { invoke } from "@tauri-apps/api/core";

import {
	getPreferencesSnapshot,
	preferencesLoaded,
} from "$lib/app-data/preferences.svelte";
import { isAndroidPlatform, isMacosPlatform } from "$lib/platform/os";

export function hapticsAvailable(): boolean {
	return isAndroidPlatform() || isMacosPlatform();
}

export function hapticThresholdReached(): void {
	if (!hapticsAvailable()) return;
	if (!preferencesLoaded()) return;
	if (!getPreferencesSnapshot().hapticFeedback) return;
	void invoke("haptic_threshold_reached").catch(console.error);
}
