import { addonInstallerAvailable } from "$lib/updates/addon.svelte";
import {
	updatesSelfManaged,
	updatesUnsupportedReason,
} from "$lib/updates/capability.svelte";

export function updateSettingsOffered(): boolean {
	return (
		updatesSelfManaged() ||
		updatesUnsupportedReason() !== null ||
		addonInstallerAvailable()
	);
}
