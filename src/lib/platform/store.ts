import { screenshotsEnabled } from "$lib/demo/config";
import { screenshotScene } from "$lib/demo/screenshot-scene";

export function isPlayBuild(): boolean {
	if (screenshotsEnabled && screenshotScene.playBuild) return true;
	return import.meta.env.OPEN_GRIND_STORE === "play";
}
