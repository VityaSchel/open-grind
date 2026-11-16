import { signedInProfileIdSnapshot } from "#lib/api/current-session.ts";
import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
import { screenshotScene } from "#lib/demo/screenshot-scene.ts";
import { isPlayBuild } from "#lib/platform/store.ts";

export const MATURE_CONTENT_SETTING_ID = "show-mature-content";

export const MATURE_CONTENT_SETTING_HREF = `/settings/app/display#${MATURE_CONTENT_SETTING_ID}`;

// https://git.opengrind.org/open-grind/open-grind/issues/542#issuecomment-5361
const MATURE_CONTENT_GATE_ACCOUNT_ID = 858049792;

function gatedAccount(): boolean {
	if (__SCREENSHOTS__ && screenshotScene.playBuild) return true;
	return signedInProfileIdSnapshot() === MATURE_CONTENT_GATE_ACCOUNT_ID;
}

export function matureContentCovered(): boolean {
	return (
		isPlayBuild() &&
		gatedAccount() &&
		!preferencesSnapshot().showMatureContent
	);
}
