import { showErrorToast } from "$lib/api/error-toast";
import { setLocale } from "$lib/i18n";
import { toastPresenter } from "$lib/updates/toast-presenter";
import { scanView } from "./screenshot-scan";
import { type ScreenshotHooks, screenshotScene } from "./screenshot-scene";

export function installScreenshotHooks(): ScreenshotHooks {
	Object.assign(screenshotScene, window.__openGrindScreenshotScene);
	const hooks: ScreenshotHooks = {
		setLocale,
		setScene: (scene) => {
			Object.assign(screenshotScene, scene);
		},
		showErrorToast,
		updateToasts: toastPresenter,
		scan: scanView,
	};
	window.__openGrindScreenshots = hooks;
	return hooks;
}
