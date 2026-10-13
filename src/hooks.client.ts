import type { ClientInit, HandleClientError } from "@sveltejs/kit";

import { screenshotsEnabled } from "$lib/demo/config";
import { startLanguage } from "$lib/platform/app-language";
import { startRegionalSettings } from "$lib/platform/regional-settings";
import { ws } from "$lib/ws.svelte";

export const init: ClientInit = async () => {
	if (screenshotsEnabled) {
		const { installScreenshotHooks } =
			await import("$lib/demo/screenshot-hooks");
		installScreenshotHooks();
	}
	ws.connect();
	await Promise.all([startRegionalSettings(), startLanguage()]);
};

export const handleError: HandleClientError = ({ error, event, message }) => {
	console.error("Error during request to", event.url.pathname, ":", error);
	return { message, ...(error instanceof Error && { type: error.name }) };
};
