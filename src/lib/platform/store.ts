import { demo } from "$lib/demo";

export function isPlayBuild(): boolean {
	if (__SCREENSHOTS__ && demo().screenshotScene.playBuild) return true;
	return import.meta.env.OPEN_GRIND_STORE === "play";
}
