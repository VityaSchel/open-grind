import { unregisterPushToken } from "#lib/api/settings/account.ts";
import { setPreferences } from "#lib/app-data/preferences.svelte.ts";
import {
	currentFastSource,
	deletePushToken,
	inFastMode,
	mintPushToken,
	setNotificationsEnabled,
	unregisterRelay,
} from "./index";

export async function forgetPushRegistration(): Promise<void> {
	switch (await currentFastSource().catch(() => null)) {
		case "addon":
			await forgetFastAddonRegistration();
			return;
		case "relay":
			await forgetRelayRegistration();
			return;
		case null:
			return;
	}
}

export async function forgetFastAddonRegistration(): Promise<void> {
	if (await inFastMode()) await forgetAddonRegistration();
}

export async function forgetRelayRegistration(): Promise<void> {
	await unregisterRelay().catch((error: unknown) => {
		console.error("Failed to unregister the fcm-relay token", error);
	});
}

export async function forgetAddonRegistration(): Promise<void> {
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
