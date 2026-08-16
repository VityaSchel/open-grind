import { goto } from "$app/navigation";

import { clearAccountCaches } from "$lib/api/account-caches";
import { callMethod } from "$lib/api/methods";
import { clearAccountPreferences } from "$lib/app-data/preferences.svelte";
import { inboxLastViewed } from "$lib/chat/inbox-last-viewed.svelte";
import { tapsLastViewed } from "$lib/interest/taps-last-viewed";

export async function signOut(): Promise<void> {
	try {
		await callMethod("logout");
	} catch (error) {
		console.error(error);
	}

	await goto("/auth/sign-in");

	for (const marker of [inboxLastViewed, tapsLastViewed])
		marker.clearStored();
	clearAccountCaches();

	try {
		await clearAccountPreferences();
	} catch (error) {
		console.error(error);
	}
}
