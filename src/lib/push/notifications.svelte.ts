import { registerPushToken } from "$lib/api/settings/account";
import { getInstalledVersion } from "$lib/updates";
import { addonFlow, addonInstallerAvailable } from "$lib/updates/addon.svelte";
import { FCM_COMPONENT } from "$lib/updates/components";
import { enableFailureText } from "./copy";
import {
	addonReady,
	currentMode,
	deletePushToken,
	mintPushToken,
	notificationsPermitted,
	pushAvailableHere,
	pushErrorReason,
	requestNotifications,
	setMode,
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
}>({
	mode: "slow",
	phase: "idle",
	problem: null,
	addonRequested: false,
	manualInstall: false,
});

export const notificationSettings = {
	get mode(): NotificationMode {
		return state.mode;
	},
	get phase(): Phase {
		return state.phase;
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
	state.mode = await currentMode().catch(() => "slow");
	if (
		state.mode === "fast" &&
		!(await notificationsPermitted().catch(() => true))
	) {
		state.problem = enableFailureText("notificationsBlocked");
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

async function enableFastMode(): Promise<void> {
	state.phase = "working";
	try {
		await addonReady();
		if (!(await requestNotifications())) {
			state.problem = enableFailureText("notificationsBlocked");
			return;
		}
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
