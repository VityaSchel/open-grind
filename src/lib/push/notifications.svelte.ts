import { showErrorToast } from "$lib/api/error-toast";
import { registerPushToken } from "$lib/api/settings/account";
import {
	getPreferences,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { addonGone } from "./delivery-dead";
import { fallBackToSlow, freshPushToken } from "./delivery.svelte";
import { pushFailures } from "./error-copy";
import {
	addonReady,
	currentMode,
	inFastMode,
	notificationPermission,
	openNotificationSettings,
	pushAvailableHere,
	requestNotificationPermission,
	setNotificationsEnabled,
} from "./index";
import { busy, notificationState } from "./notification-state.svelte";
import { stopNotifications } from "./teardown";

let reconciling: Promise<void> | null = null;
let sentToSettings = false;

export function reconcileNotifications(): Promise<void> {
	reconciling ??= reconcile().finally(() => {
		reconciling = null;
	});
	return reconciling;
}

export async function toggleNotifications(enabled: boolean): Promise<void> {
	if (busy()) return;
	if (enabled) notificationState.permissionPending = true;
	else notificationState.phase = "working";
	await reconciling;
	if (enabled) await turnNotificationsOn();
	else await turnNotificationsOff();
}

async function reconcile(): Promise<void> {
	if (!pushAvailableHere() || busy()) return;
	const returningFromSettings = sentToSettings;
	sentToSettings = false;
	notificationState.mode = await currentMode().catch(
		() => notificationState.mode,
	);
	const stored =
		(await getPreferences().catch(() => null))?.notificationsEnabled ===
		true;
	const permission = await notificationPermission().catch(() => null);
	if (!stored && returningFromSettings && permission?.granted) {
		await turningOn(armNotifications);
		return;
	}
	if (stored && permission?.granted === false) {
		await stopNotifications().catch(() => {});
		return;
	}
	await setNotificationsEnabled(stored).catch(() => {});
	if (stored && notificationState.mode === "fast")
		await addonReady().catch(async (error: unknown) => {
			if (addonGone(error)) await fallBackToSlow({ error });
		});
}

async function turnNotificationsOn(): Promise<void> {
	await turningOn(async () => {
		if ((await notificationPermission()).state === "denied") {
			await openNotificationSettings();
			sentToSettings = true;
		} else if ((await requestNotificationPermission()).granted) {
			await armNotifications();
		}
	});
}

async function turningOn(steps: () => Promise<void>): Promise<void> {
	notificationState.permissionPending = true;
	try {
		await steps();
	} catch (error) {
		await setNotificationsEnabled(false).catch(() => {});
		showErrorToast({ label: pushFailures.turnOn, error });
	} finally {
		notificationState.permissionPending = false;
	}
}

async function armNotifications(): Promise<void> {
	await setNotificationsEnabled(true);
	await setPreferences({ notificationsEnabled: true });
	if (!(await inFastMode())) return;
	try {
		await registerPushToken(await freshPushToken());
	} catch (error) {
		await fallBackToSlow({ error });
	}
}

async function turnNotificationsOff(): Promise<void> {
	notificationState.phase = "working";
	try {
		await stopNotifications();
	} catch (error) {
		showErrorToast({ label: pushFailures.turnOff, error });
	} finally {
		notificationState.phase = "idle";
	}
}
