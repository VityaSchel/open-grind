import { demo, screenshotsEnabled } from "$lib/demo";

export function isPlayBuild(): boolean {
	if (screenshotsEnabled && demo().screenshotScene.playBuild) return true;
	return import.meta.env.OPEN_GRIND_STORE === "play";
}
