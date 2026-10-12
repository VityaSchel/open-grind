import type { ClientInit, HandleClientError } from "@sveltejs/kit";

import { screenshotsEnabled } from "$lib/demo/config";
import { locales, setLocale } from "$lib/i18n";
import { startRegionalSettings } from "$lib/platform/regional-settings";
import { ws } from "$lib/ws.svelte";

async function applyLocaleParam(): Promise<void> {
	const locale = new URLSearchParams(location.search).get("locale");
	if (locale !== null && locales.includes(locale)) {
		await setLocale({ locale });
	}
}

export const init: ClientInit = async () => {
	ws.connect();
	await startRegionalSettings();
	if (import.meta.env.DEV || screenshotsEnabled) await applyLocaleParam();
};

export const handleError: HandleClientError = ({ error, event, message }) => {
	console.error("Error during request to", event.url.pathname, ":", error);
	return { message, ...(error instanceof Error && { type: error.name }) };
};
