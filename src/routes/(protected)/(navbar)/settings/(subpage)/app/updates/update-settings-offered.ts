import { addonInstallerAvailable } from "#lib/updates/addon.svelte.ts";
import {
	updatesSelfManaged,
	updatesUnsupportedReason,
} from "#lib/updates/capability.svelte.ts";

export function updateSettingsOffered(): boolean {
	return (
		updatesSelfManaged() ||
		updatesUnsupportedReason() !== null ||
		addonInstallerAvailable()
	);
}
