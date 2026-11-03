import type { ClientInit, HandleClientError } from "@sveltejs/kit";

import { startLanguage } from "#lib/platform/app-language.ts";
import { isMacosPlatform } from "#lib/platform/os.ts";
import { startRegionalSettings } from "#lib/platform/regional-settings.ts";
import { ws } from "#lib/ws.svelte.ts";

export const init: ClientInit = async () => {
	if (__SCREENSHOTS__) {
		const { installScreenshotHooks } =
			await import("#lib/demo/screenshot-hooks.ts");
		installScreenshotHooks();
	}
	ws.connect();
	await Promise.all([startRegionalSettings(), startLanguage()]);
	if (isMacosPlatform()) {
		void import("#lib/platform/app-menu.ts")
			.then(({ startAppMenu }) => startAppMenu())
			.catch(console.error);
	}
};

export const handleError: HandleClientError = ({ error, event, message }) => {
	console.error("Error during request to", event.url.pathname, ":", error);
	return { message, ...(error instanceof Error && { type: error.name }) };
};
