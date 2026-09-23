import { goto } from "$app/navigation";

import { registerPushToken } from "$lib/api/settings/account";
import { onSignOut } from "$lib/api/sign-out";
import { loadNotificationCategories } from "./categories.svelte";
import { routeForDeeplink } from "./deeplink";
import { fastDeliveryDead } from "./delivery-dead";
import { fallBackToSlow } from "./delivery.svelte";
import {
	inFastMode,
	mintPushToken,
	notificationsEnabled,
	pushAvailableHere,
	takePushDeeplink,
	watchPush,
} from "./index";
import { reconcileNotifications } from "./notifications.svelte";
import { forgetPushRegistration } from "./teardown";

export async function startPushWatch(): Promise<void> {
	if (!pushAvailableHere()) return;
	onSignOut(releaseRegistration);
	await watchPush(({ deeplinkPending, tokenChanged }) => {
		if (deeplinkPending) void openPendingDeeplink();
		if (tokenChanged) void syncPushToken({ rotated: true });
	});
	await openPendingDeeplink();
	await reconcileNotifications();
	await loadNotificationCategories();
	await syncPushToken({ rotated: false });
}

async function releaseRegistration(): Promise<void> {
	if (await notificationsEnabled().catch(() => false))
		await forgetPushRegistration();
}

async function openPendingDeeplink(): Promise<void> {
	const deeplink = await takePushDeeplink().catch(() => null);
	const route = deeplink === null ? null : routeForDeeplink(deeplink);
	if (!route) return;
	await goto(route).catch((error: unknown) => {
		console.error("Failed to open the push notification", error);
	});
}

async function syncPushToken({ rotated }: { rotated: boolean }): Promise<void> {
	if (!(await notificationsEnabled().catch(() => false))) return;
	if (!(await inFastMode())) return;
	try {
		await registerPushToken(await mintPushToken());
	} catch (error) {
		console.error("Failed to register the push token", error);
		if (rotated || (await fastDeliveryDead(error)))
			await fallBackToSlow({ error });
	}
}
