import type { ClientInit, HandleClientError } from "@sveltejs/kit";

import { loadDemo } from "$lib/demo";
import { startLanguage } from "$lib/platform/app-language";
import { isMacosPlatform } from "$lib/platform/os";
import { startRegionalSettings } from "$lib/platform/regional-settings";
import { ws } from "$lib/ws.svelte";

export const init: ClientInit = async () => {
	if (__DEMO__) await loadDemo();
	if (__SCREENSHOTS__) {
		const { installScreenshotHooks } =
			await import("$lib/demo/screenshot-hooks");
		installScreenshotHooks();
	}
	ws.connect();
	await Promise.all([startRegionalSettings(), startLanguage()]);
	if (isMacosPlatform()) {
		void import("$lib/platform/app-menu")
			.then(({ startAppMenu }) => startAppMenu())
			.catch(console.error);
	}
};

export const handleError: HandleClientError = ({ error, event, message }) => {
	console.error("Error during request to", event.url.pathname, ":", error);
	return { message, ...(error instanceof Error && { type: error.name }) };
};
