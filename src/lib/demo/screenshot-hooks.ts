import { goto } from "$app/navigation";

import { showErrorToast } from "$lib/api/error-toast";
import { setLocale } from "$lib/i18n";
import { updateErrorText } from "$lib/updates/error-copy";
import { toastPresenter } from "$lib/updates/toast-presenter";
import { type ScreenshotHooks, screenshotScene } from "./screenshot-scene";

export function installScreenshotHooks(): ScreenshotHooks {
	Object.assign(screenshotScene, window.__openGrindScreenshotScene);
	const hooks: ScreenshotHooks = {
		scene: screenshotScene,
		setLocale,
		goto,
		showErrorToast,
		updateToasts: toastPresenter,
		updateErrorText,
	};
	window.__openGrindScreenshots = hooks;
	return hooks;
}
