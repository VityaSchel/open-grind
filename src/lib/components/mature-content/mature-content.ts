import { signedInProfileIdSnapshot } from "#lib/api/current-session.ts";
import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
import { isPlayBuild } from "#lib/platform/store.ts";

export const MATURE_CONTENT_SETTING_ID = "show-mature-content";

export const MATURE_CONTENT_SETTING_HREF = `/settings/app/display#${MATURE_CONTENT_SETTING_ID}`;

// https://git.opengrind.org/open-grind/open-grind/issues/542#issuecomment-5361
const MATURE_CONTENT_GATE_ACCOUNT_ID = 858049792;

export function matureContentCovered(): boolean {
	return (
		isPlayBuild() &&
		signedInProfileIdSnapshot() === MATURE_CONTENT_GATE_ACCOUNT_ID &&
		!preferencesSnapshot().showMatureContent
	);
}
