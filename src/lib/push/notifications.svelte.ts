import { registerPushToken } from "$lib/api/settings/account";
import {
	getPreferences,
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import { getInstalledVersion } from "$lib/updates";
import { addonFlow, addonInstallerAvailable } from "$lib/updates/addon.svelte";
import { FCM_COMPONENT } from "$lib/updates/components";
import { enableFailureText } from "./copy";
import {
	addonReady,
	currentMode,
	deletePushToken,
	mintPushToken,
	notificationPermission,
	openNotificationSettings,
	pushAvailableHere,
	pushErrorReason,
	requestNotificationPermission,
	setMode,
	setNotificationsEnabled,
} from "./index";
import { forgetPushRegistration } from "./teardown";
import type { NotificationMode } from "./types";

type Phase = "idle" | "installing" | "working";

const state = $state<{
	mode: NotificationMode;
	phase: Phase;
	problem: string | null;
	addonRequested: boolean;
	manualInstall: boolean;
	permissionPending: boolean;
}>({
	mode: "slow",
	phase: "idle",
	problem: null,
	addonRequested: false,
	manualInstall: false,
	permissionPending: false,
});

export const notificationSettings = {
	get enabled(): boolean {
		return preferencesSnapshot().notificationsEnabled;
	},
	get mode(): NotificationMode {
		return state.mode;
	},
	get phase(): Phase {
		return state.phase;
	},
	get permissionPending(): boolean {
		return state.permissionPending;
	},
	get problem(): string | null {
		return state.problem;
	},
	get addonRequested(): boolean {
		return state.addonRequested;
	},
	get manualInstall(): boolean {
		return state.manualInstall;
	},
};

export function addonInstallableHere(): boolean {
	return addonInstallerAvailable();
}

export async function loadNotificationSettings(): Promise<void> {
	if (!pushAvailableHere()) return;
	if (state.phase !== "idle" || state.permissionPending) return;
	state.mode = await currentMode().catch(() => "slow");
	const stored =
		(await getPreferences().catch(() => null))?.notificationsEnabled ===
		true;
	const granted = (await notificationPermission().catch(() => null))?.granted;
	const enabled = stored && granted === true;
	if (enabled !== stored)
		await setPreferences({ notificationsEnabled: enabled }).catch(() => {});
	await setNotificationsEnabled(enabled).catch(() => {});
}

export async function toggleNotifications(enabled: boolean): Promise<void> {
	if (state.phase !== "idle" || state.permissionPending) return;
	state.problem = null;
	if (!enabled) {
		await turnNotificationsOff();
		return;
	}
	state.permissionPending = true;
	try {
		const permission = await requestNotificationPermission();
		if (permission.granted) await turnNotificationsOn();
		else if (permission.state === "denied")
			await openNotificationSettings();
	} catch (error) {
		state.problem = enableFailureText(pushErrorReason(error));
	} finally {
		state.permissionPending = false;
	}
}

export async function selectNotificationMode(
	mode: NotificationMode,
): Promise<void> {
	if (state.phase === "working" || state.mode === mode) return;
	state.problem = null;
	state.manualInstall = false;
	if (mode === "slow") {
		await disableFastMode();
	} else if (await addonInstalled()) {
		await enableFastMode();
	} else if (addonInstallerAvailable()) {
		state.addonRequested = true;
	} else {
		state.manualInstall = true;
	}
}

export async function installPushAddon(): Promise<void> {
	dismissAddonRequest();
	state.phase = "installing";
	try {
		await addonFlow(FCM_COMPONENT).installNow();
	} catch (error) {
		state.phase = "idle";
		state.problem = enableFailureText(pushErrorReason(error));
	}
}

export function dismissAddonRequest(): void {
	state.addonRequested = false;
}

export async function pushAddonInstalled(): Promise<void> {
	if (state.phase !== "installing") return;
	await enableFastMode();
}

async function turnNotificationsOn(): Promise<void> {
	await setNotificationsEnabled(true);
	await setPreferences({ notificationsEnabled: true });
	if (state.mode === "fast") await registerPushToken(await mintPushToken());
}

async function turnNotificationsOff(): Promise<void> {
	state.phase = "working";
	try {
		await setNotificationsEnabled(false);
		await setPreferences({ notificationsEnabled: false });
	} catch (error) {
		state.problem = enableFailureText(pushErrorReason(error));
	}
	await forgetPushRegistration().catch(() => {});
	await deletePushToken().catch(() => {});
	state.phase = "idle";
}

async function enableFastMode(): Promise<void> {
	state.phase = "working";
	try {
		await addonReady();
		await registerPushToken(await mintPushToken());
		await setMode("fast");
		state.mode = "fast";
	} catch (error) {
		state.problem = enableFailureText(pushErrorReason(error));
	} finally {
		state.phase = "idle";
	}
}

async function disableFastMode(): Promise<void> {
	state.phase = "working";
	await forgetPushRegistration().catch(() => {});
	try {
		await setMode("slow");
	} catch (error) {
		state.problem = enableFailureText(pushErrorReason(error));
	}
	await deletePushToken().catch(() => {});
	state.mode = "slow";
	state.phase = "idle";
}

async function addonInstalled(): Promise<boolean> {
	return (
		(await getInstalledVersion(FCM_COMPONENT).catch(() => null)) !== null
	);
}
