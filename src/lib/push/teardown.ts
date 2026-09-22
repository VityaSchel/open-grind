import { unregisterPushToken } from "$lib/api/settings/account";
import { setPreferences } from "$lib/app-data/preferences.svelte";
import {
	deletePushToken,
	inFastMode,
	mintPushToken,
	setNotificationsEnabled,
} from "./index";

export async function forgetPushRegistration(): Promise<void> {
	if (!(await inFastMode())) return;
	const minted = await mintPushToken().catch(() => null);
	if (!minted) return;
	await unregisterPushToken(minted.token).catch((error: unknown) => {
		console.error("Failed to unregister the push token", error);
	});
}

export async function stopNotifications(): Promise<void> {
	await setNotificationsEnabled(false);
	await setPreferences({ notificationsEnabled: false });
	await forgetPushRegistration();
	await deletePushToken().catch(() => {});
}
