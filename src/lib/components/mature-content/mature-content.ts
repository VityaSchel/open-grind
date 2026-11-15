import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
import { isPlayBuild } from "#lib/platform/store.ts";

export const MATURE_CONTENT_SETTING_ID = "show-mature-content";

export const MATURE_CONTENT_SETTING_HREF = `/settings/app#${MATURE_CONTENT_SETTING_ID}`;

export function matureContentCovered(): boolean {
	return isPlayBuild() && !preferencesSnapshot().showMatureContent;
}
