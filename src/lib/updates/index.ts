import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import { APP_COMPONENT, type ComponentKey } from "./components";
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

export { COMPONENT_PACKAGE, GOOGLE_OAUTH_COMPONENT } from "./components";
export { APP_COMPONENT, type ComponentKey };

export function updatesAvailableHere(): boolean {
	return isTauri() && !demoEnabled;
}

export async function getUpdateCapability(): Promise<Capability> {
	if (!updatesAvailableHere()) return unavailableCapability;
	return parsed("updater_capability", capabilitySchema);
}

export async function getUpdateSettings(): Promise<Settings> {
	return parsed("updater_settings", settingsSchema);
}

export async function setAutomaticUpdateChecks(
	enabled: boolean,
): Promise<Settings> {
	return parsed("updater_set_auto_check", settingsSchema, { enabled });
}

export async function checkForUpdate({
	trigger,
	component = APP_COMPONENT,
}: {
	trigger: "manual" | "launch" | "automatic";
	component?: ComponentKey;
}): Promise<CheckResult> {
	return parsed("updater_check", checkResultSchema, { component, trigger });
}

export async function startUpdateDownload(
	component: ComponentKey = APP_COMPONENT,
): Promise<Progress> {
	return parsed("updater_download", progressSchema, { component });
}

export async function cancelUpdateDownload(
	component: ComponentKey = APP_COMPONENT,
): Promise<void> {
	await invoke("updater_cancel_download", { component });
}

export async function getUpdateProgress(): Promise<Progress | null> {
	return parsed("updater_progress", progressSchema.nullable());
}

export async function getUpdateReadiness(
	component: ComponentKey = APP_COMPONENT,
): Promise<Readiness> {
	if (!updatesAvailableHere()) return unavailableReadiness;
	return parsed("updater_readiness", readinessSchema, { component });
}

export async function installUpdate(
	component: ComponentKey = APP_COMPONENT,
): Promise<void> {
	await invoke("updater_install", { component });
}

export async function installPending(): Promise<boolean> {
	if (!updatesAvailableHere()) return false;
	return parsed("updater_install_pending", z.boolean());
}

export async function getInstalledVersion(
	component: ComponentKey,
): Promise<string | null> {
	if (!updatesAvailableHere()) return null;
	return parsed("updater_installed_version", z.string().nullable(), {
		component,
	});
}

export async function takeInstallOutcome(): Promise<InstallOutcome | null> {
	return parsed(
		"updater_take_install_outcome",
		installOutcomeSchema.nullable(),
	);
}

export async function openInstallPermissionSettings(): Promise<void> {
	await invoke("updater_open_install_permission_settings");
}

export async function discardStagedUpdate(
	component: ComponentKey = APP_COMPONENT,
): Promise<void> {
	await invoke("updater_discard", { component });
}

export function onInstallFinished(handler: (outcome: InstallOutcome) => void) {
	return subscribed("updater:install", installOutcomeSchema, handler);
}

export function onUpdateProgress(handler: (progress: Progress) => void) {
	return subscribed("updater:progress", progressSchema, handler);
}
