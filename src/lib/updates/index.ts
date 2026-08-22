import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { demoEnabled } from "$lib/demo";
import {
	type Capability,
	capabilitySchema,
	type CheckResult,
	checkResultSchema,
	type InstallOutcome,
	installOutcomeSchema,
	type Progress,
	progressSchema,
	type Readiness,
	readinessSchema,
	type Settings,
	settingsSchema,
	type Unsupported,
} from "./types";

export * from "./types";

const notPackaged: Unsupported = {
	reason: "noReleaseArtifacts",
	detail: { target: "web" },
};
const unavailableCapability: Capability = {
	state: "unsupported",
	detail: notPackaged,
};
const unavailableReadiness: Readiness = {
	state: "unsupported",
	detail: notPackaged,
};

async function parsed<T>(
	command: string,
	schema: { parse(input: unknown): T },
	args?: Record<string, unknown>,
): Promise<T> {
	return schema.parse(await (args ? invoke(command, args) : invoke(command)));
}

function subscribed<T>(
	event: string,
	schema: {
		safeParse(
			input: unknown,
		):
			| { success: true; data: T }
			| { success: false; error: { issues: unknown } };
	},
	handler: (value: T) => void,
) {
	return listen(event, ({ payload }) => {
		const result = schema.safeParse(payload);
		if (result.success) {
			handler(result.data);
		} else {
			console.error(`Unexpected ${event} payload`, result.error.issues);
		}
	});
}

export function updatesAvailableHere(): boolean {
	return isTauri() && !demoEnabled;
}

export async function getUpdateCapability(): Promise<Capability> {
	if (!updatesAvailableHere()) return unavailableCapability;
	return parsed("update_capability", capabilitySchema);
}

export async function getUpdateSettings(): Promise<Settings> {
	return parsed("update_settings", settingsSchema);
}

export async function setAutomaticUpdateChecks(
	enabled: boolean,
): Promise<Settings> {
	return parsed("update_set_auto_check", settingsSchema, { enabled });
}

export async function checkForUpdate(
	trigger: "manual" | "launch" | "automatic",
): Promise<CheckResult> {
	return parsed("update_check", checkResultSchema, { trigger });
}

export async function startUpdateDownload(): Promise<Progress> {
	return parsed("update_download", progressSchema);
}

export async function cancelUpdateDownload(): Promise<void> {
	await invoke("update_cancel_download");
}

export async function getUpdateProgress(): Promise<Progress | null> {
	return parsed("update_progress", progressSchema.nullable());
}

export async function getUpdateReadiness(): Promise<Readiness> {
	if (!updatesAvailableHere()) return unavailableReadiness;
	return parsed("update_readiness", readinessSchema);
}

export async function installUpdate(): Promise<void> {
	await invoke("update_install");
}

export async function takeInstallOutcome(): Promise<InstallOutcome | null> {
	return parsed(
		"update_take_install_outcome",
		installOutcomeSchema.nullable(),
	);
}

export async function openInstallPermissionSettings(): Promise<void> {
	await invoke("update_open_install_permission_settings");
}

export async function discardStagedUpdate(): Promise<void> {
	await invoke("update_discard");
}

export function onInstallFinished(handler: (outcome: InstallOutcome) => void) {
	return subscribed("update:install", installOutcomeSchema, handler);
}

export function onUpdateProgress(handler: (progress: Progress) => void) {
	return subscribed("update:progress", progressSchema, handler);
}
