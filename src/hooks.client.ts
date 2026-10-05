import type { ClientInit, HandleClientError } from "@sveltejs/kit";

import { locales, setLocale } from "$lib/i18n";
import { ws } from "$lib/ws.svelte";

async function applyLocaleParam(): Promise<void> {
	const locale = new URLSearchParams(location.search).get("locale");
	if (locale !== null && locales.includes(locale)) {
		await setLocale({ locale });
	}
}

export const init: ClientInit = async () => {
	ws.connect();
	if (import.meta.env.DEV) await applyLocaleParam();
};

export const handleError: HandleClientError = ({ error, event }) => {
	console.error("Error during request to", event.url.pathname, ":", error);
};
