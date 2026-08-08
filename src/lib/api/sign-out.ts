import { goto } from "$app/navigation";

import { clearAccountCaches } from "$lib/api/account-caches";
import { callMethod } from "$lib/api/methods";
import { clearAccountPreferences } from "$lib/app-data/preferences.svelte";
import { INBOX_LAST_VIEWED_PREFIX } from "$lib/chat/inbox-last-viewed";

export async function signOut(): Promise<void> {
	try {
		await callMethod("logout");
	} catch (error) {
		console.error(error);
	}

	await goto("/auth/sign-in");

	clearInboxMarkers();
	clearAccountCaches();

	try {
		await clearAccountPreferences();
	} catch (error) {
		console.error(error);
	}
}

function clearInboxMarkers(): void {
	if (typeof localStorage === "undefined") return;
	for (const key of Object.keys(localStorage)) {
		if (key.startsWith(INBOX_LAST_VIEWED_PREFIX))
			localStorage.removeItem(key);
	}
}
