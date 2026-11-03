import { screenshotScene } from "#lib/demo/screenshot-scene.ts";

export function isPlayBuild(): boolean {
	if (__SCREENSHOTS__ && screenshotScene.playBuild) return true;
	return import.meta.env.OPEN_GRIND_STORE === "play";
}
