import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
import type { FastSource, NotificationMode } from "./types";

type Phase = "idle" | "enablingFast" | "working";

type AddonDialog = "install" | "manual";

type RelayStep = "config" | "waiting" | "verify";

type AddonAttempt = { id: number; fromConfigDialog: boolean };

export const notificationState = $state<{
	mode: NotificationMode;
	phase: Phase;
	permissionPending: boolean;
	addonDialog: AddonDialog | null;
	fastSource: FastSource | null;
	playServices: boolean | null;
	configDialogOpen: boolean;
	pendingSource: FastSource | null;
	relayStep: RelayStep | null;
	committing: boolean;
	codeMismatch: boolean;
	addonAttempt: AddonAttempt | null;
}>({
	mode: "slow",
	phase: "idle",
	permissionPending: false,
	addonDialog: null,
	fastSource: null,
	playServices: null,
	configDialogOpen: false,
	pendingSource: null,
	relayStep: null,
	committing: false,
	codeMismatch: false,
	addonAttempt: null,
});

export function busy(): boolean {
	return changingDelivery() || notificationState.pendingSource !== null;
}

export function changingDelivery(): boolean {
	return (
		notificationState.phase !== "idle" ||
		notificationState.permissionPending ||
		notificationState.committing ||
		notificationState.pendingSource === "addon"
	);
}

export const notificationSettings = {
	get enabled(): boolean {
		return preferencesSnapshot().notificationsEnabled;
	},
	get mode(): NotificationMode {
		return notificationState.mode;
	},
	get phase(): Phase {
		return notificationState.phase;
	},
	get permissionPending(): boolean {
		return notificationState.permissionPending;
	},
	get busy(): boolean {
		return busy();
	},
	get addonDialog(): AddonDialog | null {
		return notificationState.addonDialog;
	},
	get fastSource(): FastSource | null {
		return notificationState.fastSource;
	},
	get playServices(): boolean | null {
		return notificationState.playServices;
	},
	get configDialogOpen(): boolean {
		return notificationState.configDialogOpen;
	},
	get pendingSource(): FastSource | null {
		return notificationState.pendingSource;
	},
	get relayStep(): RelayStep | null {
		return notificationState.relayStep;
	},
	get committing(): boolean {
		return notificationState.committing;
	},
	get codeMismatch(): boolean {
		return notificationState.codeMismatch;
	},
};
