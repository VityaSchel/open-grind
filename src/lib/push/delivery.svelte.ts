import { goto } from "$app/navigation";
import { page } from "$app/state";
import { toast } from "svelte-sonner";

import { showErrorToast } from "#lib/api/error-toast.ts";
import { registerPushToken } from "#lib/api/settings/account.ts";
import { t } from "#lib/i18n/index.ts";
import { openExternalLink } from "#lib/platform/link-opener.ts";
import {
	addonFlow,
	addonInstallerAvailable,
	onAddonInstalled,
} from "#lib/updates/addon.svelte.ts";
import { FCM_COMPONENT } from "#lib/updates/components.ts";
import { manualInstallHref } from "#lib/updates/manual-install.ts";
import { relayGone } from "./delivery-dead";
import { pushFailures } from "./error-copy";
import { explainedPushError } from "./explained-error";
import {
	addonReady,
	awaitRelay,
	beginRelaySetup,
	cancelRelaySetup,
	commitRelay,
	currentFastSource,
	deletePushToken,
	fcmServiceInstalled,
	forgetRelay,
	mintPushToken,
	pushErrorReason,
	registerRelay,
	relayStatus,
	saveRelayConfig,
	setFastSource,
	setMode,
	shareRelayConfig,
} from "./index";
import {
	busy,
	notificationSettings,
	notificationState,
} from "./notification-state.svelte";
import {
	forgetAddonRegistration,
	forgetPushRegistration,
	forgetRelayRegistration,
} from "./teardown";
import type {
	FastSource,
	NotificationMode,
	PushErrorReason,
	PushToken,
} from "./types";

const RELAY_STOPPED_TOAST_ID = "push-relay-stopped";

const NOTIFICATION_SETTINGS_PATH = "/settings/app/notifications";

const RELAY_CODE = /^\d{6}$/;

const SILENT_ENDS: ReadonlySet<PushErrorReason> = new Set<PushErrorReason>([
	"relayCancelled",
	"relayDistributorUnavailable",
]);

const SETUP_GONE: ReadonlySet<PushErrorReason> = new Set<PushErrorReason>([
	"relayCancelled",
	"relaySetupLost",
	"relayNoSetup",
]);

let addonAttempts = 0;
let stopWatchingAddonInstall: (() => void) | null = null;
let relaySetups = 0;
let codeEdits = 0;

export async function selectNotificationMode(
	mode: NotificationMode,
): Promise<void> {
	if (
		busy() ||
		!notificationSettings.enabled ||
		notificationState.mode === mode
	)
		return;
	abandonAddonAttempt();
	if (mode === "slow") await switchToSlow();
	else await switchToFast();
}

export async function readFastSource(): Promise<FastSource | null> {
	const source = await currentFastSource().catch(
		() => notificationState.fastSource,
	);
	notificationState.fastSource = source;
	return source;
}

export function openFastModeConfig(): void {
	if (notificationState.relayStep === "connected") endRelaySetup();
	notificationState.configDialogOpen = true;
}

export async function closeFastModeConfig(): Promise<void> {
	notificationState.configDialogOpen = false;
	if (notificationState.relayStep === "connected") endRelaySetup();
	if (notificationState.addonAttempt?.fromConfigDialog) abandonAddonAttempt();
	await cancelRelaySetupFlow();
}

export function finishRelaySetup(): void {
	if (notificationState.relayStep === "connected")
		notificationState.configDialogOpen = false;
}

export async function chooseFastSource(source: FastSource): Promise<void> {
	if (busy() || !notificationSettings.enabled) return;
	switch (source) {
		case "addon":
			if (
				notificationState.fastSource === "addon" &&
				notificationState.mode === "fast"
			)
				return;
			abandonAddonAttempt();
			await chooseAddon();
			return;
		case "relay":
			abandonAddonAttempt();
			await chooseRelay();
			return;
	}
}

export async function saveRelayConfigFile(): Promise<void> {
	if (notificationState.relayStep === null) return;
	await saveRelayConfig().catch((error: unknown) => {
		showErrorToast({
			label: t(pushFailures.relaySave),
			error: explainedPushError(error),
		});
	});
}

export async function shareRelayConfigFile(): Promise<void> {
	if (notificationState.relayStep === null) return;
	await shareRelayConfig().catch((error: unknown) => {
		showErrorToast({
			label: t(pushFailures.relayShare),
			error: explainedPushError(error),
		});
	});
}

export function confirmRelayConfigSaved(): void {
	if (notificationState.relayStep === "config")
		notificationState.relayStep = "waiting";
}

export async function cancelRelaySetupFlow(): Promise<void> {
	if (
		notificationState.committing ||
		notificationState.pendingSource !== "relay"
	)
		return;
	relaySetups += 1;
	endRelaySetup();
	await cancelRelaySetup().catch((error: unknown) => {
		console.error("Failed to cancel the fcm-relay setup", error);
	});
}

export async function submitRelayCode(code: string): Promise<void> {
	if (
		notificationState.committing ||
		notificationState.relayStep !== "verify" ||
		!RELAY_CODE.test(code)
	)
		return;
	const editsBefore = codeEdits;
	notificationState.committing = true;
	notificationState.codeMismatch = false;
	let matched: boolean;
	try {
		({ matched } = await commitRelay(code));
	} catch (error) {
		relayCommitFailed(error);
		return;
	}
	if (matched) {
		await finishRelayPairing();
		return;
	}
	notificationState.committing = false;
	if (editsBefore === codeEdits) notificationState.codeMismatch = true;
}

export function clearRelayCodeMismatch(): void {
	codeEdits += 1;
	notificationState.codeMismatch = false;
}

export async function continueToAddon(): Promise<void> {
	const dialog = notificationState.addonDialog;
	notificationState.addonDialog = null;
	if (dialog === "manual") {
		openExternalLink(manualInstallHref(FCM_COMPONENT));
		return;
	}
	watchAddonInstall({ fromConfigDialog: notificationState.configDialogOpen });
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
		showErrorToast({
			label: t(pushFailures.switchToSlowMode),
			error: failure,
		});
		return;
	}
	notificationState.mode = "slow";
	showErrorToast({
		label: t(pushFailures.enableFastMode),
		error: explainedPushError(error),
	});
}

export async function stopBrokenRelay(): Promise<void> {
	if (!(await resetBrokenRelay())) return;
	toast.error(t(pushFailures.relayStopped), {
		id: RELAY_STOPPED_TOAST_ID,
		action: {
			label: t(pushFailures.relayStoppedAction),
			onClick: openFastModeConfigPage,
		},
	});
}

function openFastModeConfigPage(): void {
	openFastModeConfig();
	if (page.url.pathname === NOTIFICATION_SETTINGS_PATH) return;
	void goto(NOTIFICATION_SETTINGS_PATH)
		.catch((error: unknown) => {
			console.error("Failed to open the notification settings", error);
		})
		.finally(() => {
			if (page.url.pathname !== NOTIFICATION_SETTINGS_PATH)
				notificationState.configDialogOpen = false;
		});
}

export async function freshPushToken(): Promise<PushToken> {
	await deletePushToken().catch(() => {});
	return await mintPushToken();
}

async function switchToFast(): Promise<void> {
	switch (await readFastSource()) {
		case null:
			openFastModeConfig();
			return;
		case "addon":
			if (await fcmServiceInstalled()) await enableFastMode();
			else offerAddonInstall();
			return;
		case "relay":
			await enableRelayFastMode();
			return;
	}
}

function offerAddonInstall(): void {
	notificationState.addonDialog = addonInstallerAvailable()
		? "install"
		: "manual";
}

function watchAddonInstall({
	fromConfigDialog,
}: {
	fromConfigDialog: boolean;
}): void {
	abandonAddonAttempt();
	addonAttempts += 1;
	const id = addonAttempts;
	notificationState.addonAttempt = { id, fromConfigDialog };
	stopWatchingAddonInstall = onAddonInstalled({
		component: FCM_COMPONENT,
		listener: () => addonAttemptInstalled(id),
	});
}

function abandonAddonAttempt(): void {
	stopWatchingAddonInstall?.();
	stopWatchingAddonInstall = null;
	notificationState.addonAttempt = null;
}

async function addonAttemptInstalled(id: number): Promise<void> {
	if (notificationState.addonAttempt?.id !== id || busy()) return;
	if (!(await fcmServiceInstalled())) return;
	const attempt = notificationState.addonAttempt;
	if (attempt?.id !== id) return;
	abandonAddonAttempt();
	if (!notificationSettings.enabled) return;
	if (!attempt.fromConfigDialog) await enableFastMode();
	else if (await adoptAddon()) notificationState.configDialogOpen = false;
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
			label: t(pushFailures.enableFastMode),
			error: explainedPushError(error),
		});
	} finally {
		notificationState.phase = "idle";
	}
}

async function enableRelayFastMode(): Promise<void> {
	notificationState.phase = "enablingFast";
	try {
		const { paired, broken } = await relayStatus();
		if (!paired || broken) {
			await resetBrokenRelay();
			openFastModeConfig();
			return;
		}
		await registerRelay();
		await setMode("fast");
		notificationState.mode = "fast";
	} catch (error) {
		if (relayGone(error) && (await resetBrokenRelay())) {
			openFastModeConfig();
			return;
		}
		showErrorToast({
			label: t(pushFailures.enableFastMode),
			error: explainedPushError(error),
		});
	} finally {
		notificationState.phase = "idle";
	}
}

async function chooseAddon(): Promise<void> {
	notificationState.pendingSource = "addon";
	if (await fcmServiceInstalled()) {
		await adoptAddon();
		return;
	}
	notificationState.pendingSource = null;
	offerAddonInstall();
}

async function adoptAddon(): Promise<boolean> {
	const previous = notificationState.fastSource;
	notificationState.pendingSource = "addon";
	try {
		await addonReady();
		await registerPushToken(await freshPushToken());
		await setFastSource("addon");
		notificationState.fastSource = "addon";
		await setMode("fast");
		notificationState.mode = "fast";
		if (previous === "relay") await retireRelay();
		return true;
	} catch (error) {
		showErrorToast({
			label: t(pushFailures.enableFastMode),
			error: explainedPushError(error),
		});
		return false;
	} finally {
		notificationState.pendingSource = null;
	}
}

async function chooseRelay(): Promise<void> {
	relaySetups += 1;
	const setup = relaySetups;
	notificationState.pendingSource = "relay";
	notificationState.codeMismatch = false;
	try {
		await beginRelaySetup();
	} catch (error) {
		if (setup !== relaySetups) return;
		endRelaySetup();
		reportRelaySetupFailure(error);
		return;
	}
	if (setup !== relaySetups) return;
	notificationState.relayStep = "config";
	void listenForRelay(setup);
}

async function listenForRelay(setup: number): Promise<void> {
	try {
		await awaitRelay();
	} catch (error) {
		if (setup !== relaySetups) return;
		endRelaySetup();
		reportRelaySetupFailure(error);
		return;
	}
	if (setup === relaySetups && notificationState.relayStep !== null)
		notificationState.relayStep = "verify";
}

function reportRelaySetupFailure(error: unknown): void {
	const reason = pushErrorReason(error);
	if (reason !== null && SILENT_ENDS.has(reason)) return;
	if (reason === "relayNoDistributor")
		toast.error(t(pushFailures.relayNoDistributor));
	else if (reason === "relayActionRequired")
		toast.error(t(pushFailures.relayActionRequired));
	else
		showErrorToast({
			label: t(pushFailures.relaySetup),
			error: explainedPushError(error),
		});
}

function relayCommitFailed(error: unknown): void {
	notificationState.committing = false;
	const reason = pushErrorReason(error);
	if (reason === null || !SETUP_GONE.has(reason)) {
		showErrorToast({
			label: t(pushFailures.relayCodeCheck),
			error: explainedPushError(error),
		});
		return;
	}
	relaySetups += 1;
	endRelaySetup();
	reportRelaySetupFailure(error);
}

async function finishRelayPairing(): Promise<void> {
	const previous = notificationState.fastSource;
	const wasFast = notificationState.mode === "fast";
	const retiresAddon = previous === "addon" && wasFast;
	notificationState.fastSource = "relay";
	if (!notificationSettings.enabled) {
		finishFastModeConfig();
		return;
	}
	try {
		await registerRelay();
	} catch (error) {
		await settleOnSlow({ retiresAddon });
		if (previous === "relay") await forgetRelayRegistration();
		finishFastModeConfig();
		showErrorToast({
			label: t(pushFailures.enableFastMode),
			error: explainedPushError(error),
			onRetry: () => void selectNotificationMode("fast"),
		});
		return;
	}
	try {
		await setMode("fast");
		notificationState.mode = "fast";
	} catch (error) {
		finishFastModeConfig();
		showErrorToast({
			label: t(pushFailures.enableFastMode),
			error: explainedPushError(error),
			onRetry: () => void selectNotificationMode("fast"),
		});
		return;
	}
	if (retiresAddon) await retireAddonToken();
	showRelayConnected();
}

function showRelayConnected(): void {
	if (!notificationState.configDialogOpen) {
		finishFastModeConfig();
		return;
	}
	endRelaySetup();
	notificationState.relayStep = "connected";
}

async function settleOnSlow({
	retiresAddon,
}: {
	retiresAddon: boolean;
}): Promise<void> {
	try {
		await setMode("slow");
	} catch (error) {
		console.error(
			"Failed to switch push notifications to Slow Mode",
			error,
		);
		return;
	}
	notificationState.mode = "slow";
	if (retiresAddon) await retireAddonToken();
}

function endRelaySetup(): void {
	notificationState.pendingSource = null;
	notificationState.relayStep = null;
	notificationState.committing = false;
	notificationState.codeMismatch = false;
}

function finishFastModeConfig(): void {
	relaySetups += 1;
	endRelaySetup();
	notificationState.configDialogOpen = false;
}

async function retireRelay(): Promise<void> {
	await forgetRelayRegistration();
	await forgetRelay().catch((error: unknown) => {
		console.error("Failed to forget the fcm-relay pairing", error);
	});
}

async function retireAddonToken(): Promise<void> {
	await forgetAddonRegistration();
	await deletePushToken().catch(() => {});
}

async function resetBrokenRelay(): Promise<boolean> {
	if (relaySetupPending()) return false;
	await forgetRelayRegistration();
	if (relaySetupPending()) return false;
	try {
		await forgetRelay();
	} catch (error) {
		console.error("Failed to forget the fcm-relay pairing", error);
		return false;
	}
	notificationState.fastSource = null;
	notificationState.mode = "slow";
	return true;
}

function relaySetupPending(): boolean {
	return notificationState.pendingSource === "relay";
}

async function switchToSlow(): Promise<void> {
	notificationState.phase = "working";
	try {
		await forgetPushRegistration();
		await setMode("slow");
		notificationState.mode = "slow";
		await deletePushToken().catch(() => {});
	} catch (error) {
		showErrorToast({ label: t(pushFailures.switchToSlowMode), error });
	} finally {
		notificationState.phase = "idle";
	}
}
