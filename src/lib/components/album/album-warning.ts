import {
	preferencesSnapshot,
	setPreferences,
} from "#lib/app-data/preferences.svelte.ts";
import { isPlayBuild } from "#lib/platform/store.ts";

export function albumWarningDue(): boolean {
	return isPlayBuild() && !preferencesSnapshot().albumWarningSeen;
}

export function markAlbumWarningSeen(): void {
	setPreferences({ albumWarningSeen: true }).catch((error: unknown) =>
		console.error(error),
	);
}
