import { goto } from "$app/navigation";

import { clearAccountCaches } from "$lib/api/account-caches";
import { callMethod } from "$lib/api/methods";
import { clearAccountPreferences } from "$lib/app-data/preferences.svelte";
import { inboxLastViewed } from "$lib/chat/inbox-last-viewed.svelte";
import { tapsLastViewed } from "$lib/interest/taps-last-viewed";
import {
	deletePushToken,
	fcmServiceInstalled,
	pushAvailableHere,
	setNotificationsEnabled,
} from "$lib/push";

const releases = new Set<() => Promise<void>>();

export function onSignOut(release: () => Promise<void>): void {
	releases.add(release);
}

export async function signOut({
	destination = "/auth/sign-in",
}: { destination?: string } = {}): Promise<void> {
	for (const release of releases) {
		try {
			await release();
		} catch (error) {
			console.error("Failed to release a signed-in resource", error);
		}
	}

	try {
		await callMethod("sign_out");
	} catch (error) {
		console.error(error);
	}

	await goto(destination);
	await clearAccountState();
}

export async function clearAccountState(): Promise<void> {
	for (const marker of [inboxLastViewed, tapsLastViewed])
		marker.clearStored();
	clearAccountCaches();

	if (pushAvailableHere()) {
		await setNotificationsEnabled(false).catch((error: unknown) => {
			console.error(
				"Failed to stop notifications for this account",
				error,
			);
		});

		if (await fcmServiceInstalled()) {
			await deletePushToken().catch((error: unknown) => {
				console.error("Failed to unregister push notifications", error);
			});
		}
	}

	try {
		await clearAccountPreferences();
	} catch (error) {
		console.error(error);
	}
}
