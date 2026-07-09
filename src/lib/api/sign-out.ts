import { goto } from "$app/navigation";

import { callMethod } from "$lib/api";
import { clearAccountCaches } from "$lib/api/account-caches";
import { clearAccountPreferences } from "$lib/app-data/preferences.svelte";

const INBOX_LAST_VIEWED_PREFIX = "chat:inbox-last-viewed:";

export async function signOut(): Promise<void> {
	try {
		await callMethod("logout");
	} catch (error) {
		console.error(error);
	}

	try {
		await clearAccountPreferences();
	} catch (error) {
		console.error(error);
	}

	clearInboxMarkers();
	clearAccountCaches();

	await goto("/auth/sign-in");
}

function clearInboxMarkers(): void {
	if (typeof localStorage === "undefined") return;
	for (const key of Object.keys(localStorage)) {
		if (key.startsWith(INBOX_LAST_VIEWED_PREFIX)) localStorage.removeItem(key);
	}
}
