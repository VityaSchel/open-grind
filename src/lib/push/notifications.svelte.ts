import { showErrorToast } from "#lib/api/error-toast.ts";
import { registerPushToken } from "#lib/api/settings/account.ts";
import {
	getPreferences,
	setPreferences,
} from "#lib/app-data/preferences.svelte.ts";
import { t } from "#lib/i18n/index.ts";
import { addonGone, relayGone } from "./delivery-dead";
import {
	closeFastModeConfig,
	fallBackToSlow,
	freshPushToken,
	readFastSource,
	stopBrokenRelay,
} from "./delivery.svelte";
import { pushFailures } from "./error-copy";
import {
	addonReady,
	currentFastSource,
	currentMode,
	fastModeOptions,
	inFastMode,
	notificationPermission,
	openNotificationSettings,
	playServicesAvailable,
	pushAvailableHere,
	registerRelay,
	relayStatus,
	requestNotificationPermission,
	setMode,
	setNotificationsEnabled,
} from "./index";
import {
	busy,
	changingDelivery,
	notificationState,
} from "./notification-state.svelte";
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
	if (!pushAvailableHere() || changingDelivery()) return;
	const returningFromSettings = sentToSettings;
	sentToSettings = false;
	notificationState.mode = await currentMode().catch(
		() => notificationState.mode,
	);
	await refreshFastSource();
	const stored =
		(await getPreferences().catch(() => null))?.notificationsEnabled ===
		true;
	const permission = await notificationPermission().catch(() => null);
	if (!stored && returningFromSettings && permission?.granted) {
		await turningOn(armNotifications);
		return;
	}
	if (stored && permission?.granted === false) {
		await closeFastModeConfig();
		await stopNotifications().catch(() => {});
		return;
	}
	await setNotificationsEnabled(stored).catch(() => {});
	if (stored && notificationState.mode === "fast") await checkFastDelivery();
}

async function refreshFastSource(): Promise<void> {
	if (fastModeOptions().length === 0) return;
	const [source, playServices] = await Promise.all([
		currentFastSource().catch(() => undefined),
		playServicesAvailable().catch(() => notificationState.playServices),
	]);
	notificationState.playServices = playServices;
	if (source === undefined) return;
	notificationState.fastSource = source;
	if (source === null && notificationState.mode === "fast")
		await dropUnconfiguredFastMode();
}

async function dropUnconfiguredFastMode(): Promise<void> {
	try {
		await setMode("slow");
	} catch (error) {
		console.error("Failed to leave Fast Mode without a source", error);
		return;
	}
	notificationState.mode = "slow";
}

async function checkFastDelivery(): Promise<void> {
	switch (notificationState.fastSource) {
		case "addon":
			await addonReady().catch(async (error: unknown) => {
				if (addonGone(error)) await fallBackToSlow({ error });
			});
			return;
		case "relay": {
			const status = await relayStatus().catch(() => null);
			if (status && (!status.paired || status.broken))
				await stopBrokenRelay();
			return;
		}
		case null:
			return;
	}
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
		showErrorToast({ label: t(pushFailures.enable), error });
	} finally {
		notificationState.permissionPending = false;
	}
}

async function armNotifications(): Promise<void> {
	await setNotificationsEnabled(true);
	await setPreferences({ notificationsEnabled: true });
	if (!(await inFastMode())) return;
	switch (await readFastSource()) {
		case "addon":
			await armAddonDelivery();
			return;
		case "relay":
			await armRelayDelivery();
			return;
		case null:
			return;
	}
}

async function armAddonDelivery(): Promise<void> {
	try {
		await registerPushToken(await freshPushToken());
	} catch (error) {
		await fallBackToSlow({ error });
	}
}

async function armRelayDelivery(): Promise<void> {
	try {
		await registerRelay();
	} catch (error) {
		if (relayGone(error)) await stopBrokenRelay();
		else await fallBackToSlow({ error });
	}
}

async function turnNotificationsOff(): Promise<void> {
	notificationState.phase = "working";
	try {
		await stopNotifications();
	} catch (error) {
		showErrorToast({ label: t(pushFailures.disable), error });
	} finally {
		notificationState.phase = "idle";
	}
}
