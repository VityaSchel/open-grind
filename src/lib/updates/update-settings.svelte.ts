import { getUpdateSettings, setAutomaticUpdateChecks } from "./index";

let autoCheck = $state<boolean | null>(null);

export function automaticChecksEnabled(): boolean | null {
	return autoCheck;
}

export async function hydrateUpdateSettings(): Promise<void> {
	if (autoCheck !== null) return;
	autoCheck = (await getUpdateSettings()).autoCheck;
}

export async function saveAutomaticChecks(enabled: boolean): Promise<boolean> {
	autoCheck = (await setAutomaticUpdateChecks(enabled)).autoCheck;
	return autoCheck;
}
