import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import type { NotificationMode } from "./types";

type Phase = "idle" | "enablingFast" | "working";

type AddonDialog = "install" | "manual";

export const notificationState = $state<{
	mode: NotificationMode;
	phase: Phase;
	permissionPending: boolean;
	addonDialog: AddonDialog | null;
}>({
	mode: "slow",
	phase: "idle",
	permissionPending: false,
	addonDialog: null,
});

export function busy(): boolean {
	return (
		notificationState.phase !== "idle" ||
		notificationState.permissionPending
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
};
