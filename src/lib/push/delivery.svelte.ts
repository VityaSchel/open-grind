import { showErrorToast } from "$lib/api/error-toast";
import { registerPushToken } from "$lib/api/settings/account";
import { openExternalLink } from "$lib/platform/link-opener";
import {
	addonFlow,
	addonInstallerAvailable,
	onAddonInstalled,
} from "$lib/updates/addon.svelte";
import { FCM_COMPONENT } from "$lib/updates/components";
import { manualInstallHref } from "$lib/updates/manual-install";
import { explainedPushError, pushFailures } from "./error-copy";
import {
	addonReady,
	deletePushToken,
	fcmServiceInstalled,
	mintPushToken,
	setMode,
} from "./index";
import {
	busy,
	notificationSettings,
	notificationState,
} from "./notification-state.svelte";
import { forgetPushRegistration } from "./teardown";
import type { NotificationMode, PushToken } from "./types";

let awaitingAddon = false;

export async function selectNotificationMode(
	mode: NotificationMode,
): Promise<void> {
	if (busy() || notificationState.mode === mode) return;
	awaitingAddon = false;
	if (mode === "slow") await switchToSlow();
	else if (await fcmServiceInstalled()) await enableFastMode();
	else
		notificationState.addonDialog = addonInstallerAvailable()
			? "install"
			: "manual";
}

export async function continueToAddon(): Promise<void> {
	if (notificationState.addonDialog === "manual") {
		notificationState.addonDialog = null;
		openExternalLink(manualInstallHref(FCM_COMPONENT));
		return;
	}
	awaitingAddon = true;
	notificationState.addonDialog = null;
	onAddonInstalled({
		component: FCM_COMPONENT,
		listener: pushAddonInstalled,
	});
	await addonFlow(FCM_COMPONENT).installNow();
}

export function dismissAddonDialog(): void {
	notificationState.addonDialog = null;
}

export async function fallBackToSlow({
	error,
}: {
	error: unknown;
}): Promise<void> {
	try {
		await setMode("slow");
	} catch (failure) {
		showErrorToast({ label: pushFailures.slowMode, error: failure });
		return;
	}
	notificationState.mode = "slow";
	showErrorToast({
		label: pushFailures.fastMode,
		error: explainedPushError(error),
	});
}

export async function freshPushToken(): Promise<PushToken> {
	await deletePushToken().catch(() => {});
	return await mintPushToken();
}

async function pushAddonInstalled(): Promise<void> {
	if (!awaitingAddon || busy()) return;
	if (!(await fcmServiceInstalled())) return;
	awaitingAddon = false;
	if (notificationSettings.enabled) await enableFastMode();
}

async function enableFastMode(): Promise<void> {
	notificationState.phase = "enablingFast";
	try {
		await addonReady();
		await registerPushToken(await freshPushToken());
		await setMode("fast");
		notificationState.mode = "fast";
	} catch (error) {
		showErrorToast({
			label: pushFailures.fastMode,
			error: explainedPushError(error),
		});
	} finally {
		notificationState.phase = "idle";
	}
}

async function switchToSlow(): Promise<void> {
	notificationState.phase = "working";
	try {
		await forgetPushRegistration();
		await setMode("slow");
		notificationState.mode = "slow";
		await deletePushToken().catch(() => {});
	} catch (error) {
		showErrorToast({ label: pushFailures.slowMode, error });
	} finally {
		notificationState.phase = "idle";
	}
}
