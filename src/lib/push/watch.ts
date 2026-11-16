import { getCurrentWindow } from "@tauri-apps/api/window";
import { goto } from "$app/navigation";

import { registerPushToken } from "#lib/api/settings/account.ts";
import { onSignOut } from "#lib/api/sign-out.ts";
import { isDesktopPlatform } from "#lib/platform/os.ts";
import { loadNotificationCategories } from "./categories.svelte";
import { watchChatWithdrawals } from "./chat-withdrawals";
import { routeForDeeplink } from "./deeplink";
import { fastDeliveryDead, relayGone } from "./delivery-dead";
import { fallBackToSlow, stopBrokenRelay } from "./delivery.svelte";
import {
	currentFastSource,
	fastModeOptions,
	inFastMode,
	mintPushToken,
	notificationsEnabled,
	pushAvailableHere,
	registerRelay,
	takePushDeeplink,
	watchPush,
} from "./index";
import { reconcileNotifications } from "./notifications.svelte";
import { whileOpeningPushDeeplink } from "./opening-deeplink";
import { recheckReadsWhileAway, resyncWhileShown } from "./read-sync";
import {
	forgetFastAddonRegistration,
	forgetRelayRegistration,
} from "./teardown";

export async function startPushWatch(): Promise<void> {
	if (!pushAvailableHere()) return;
	onSignOut(releaseRegistration);
	await watchChatWithdrawals();
	await watchPush(({ deeplinkPending, tokenChanged }) => {
		if (deeplinkPending) void openPendingDeeplink();
		if (tokenChanged) void syncPushToken({ rotated: true });
	});
	await openPendingDeeplink();
	await reconcileNotifications();
	await loadNotificationCategories();
	await syncPushToken({ rotated: false });
	if (!isDesktopPlatform()) return;
	await recheckWhenFocused();
	recheckReadsWhileAway();
}

function recheckWhenFocused(): Promise<() => void> {
	return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
		if (!focused) return;
		void reconcileNotifications();
		void loadNotificationCategories();
		void resyncWhileShown();
	});
}

async function releaseRegistration(): Promise<void> {
	if (fastModeOptions().includes("relay")) await forgetRelayRegistration();
	if (!(await notificationsEnabled().catch(() => false))) return;
	if ((await currentFastSource().catch(() => null)) === "addon")
		await forgetFastAddonRegistration();
}

function openPendingDeeplink(): Promise<void> {
	return whileOpeningPushDeeplink(async () => {
		const deeplink = await takePushDeeplink().catch(() => null);
		const route = deeplink === null ? null : routeForDeeplink(deeplink);
		if (!route) return;
		await goto(route).catch((error: unknown) => {
			console.error("Failed to open the push notification", error);
		});
	});
}

async function syncPushToken({ rotated }: { rotated: boolean }): Promise<void> {
	if (!(await notificationsEnabled().catch(() => false))) return;
	if (!(await inFastMode())) return;
	switch (await currentFastSource().catch(() => null)) {
		case "addon":
			await syncAddonToken({ rotated });
			return;
		case "relay":
			await syncRelayToken();
			return;
		case null:
			return;
	}
}

async function syncAddonToken({
	rotated,
}: {
	rotated: boolean;
}): Promise<void> {
	try {
		await registerPushToken(await mintPushToken());
	} catch (error) {
		console.error("Failed to register the push token", error);
		if (rotated || (await fastDeliveryDead(error)))
			await fallBackToSlow({ error });
	}
}

async function syncRelayToken(): Promise<void> {
	try {
		await registerRelay();
	} catch (error) {
		console.error("Failed to register the fcm-relay token", error);
		if (relayGone(error)) await stopBrokenRelay();
	}
}
