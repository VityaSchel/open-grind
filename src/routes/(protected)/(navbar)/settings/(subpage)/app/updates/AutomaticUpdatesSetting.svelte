<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { addonInstallerAvailable } from "#lib/updates/addon.svelte.ts";
	import {
		updatesSelfManaged,
		updatesUnsupportedReason,
	} from "#lib/updates/capability.svelte.ts";
	import {
		automaticChecksSetting,
		checkAfterOptIn,
		manualCheckOffered,
	} from "#lib/updates/update-checks.ts";
	import {
		automaticChecksEnabled,
		hydrateUpdateSettings,
		saveAutomaticChecks,
	} from "#lib/updates/update-settings.svelte.ts";
	import CheckForUpdatesButton from "./CheckForUpdatesButton.svelte";

	let pending = $state<boolean | null>(null);
	const stored = $derived(automaticChecksEnabled());
	const value = $derived(pending ?? stored ?? false);
	const addonAvailable = addonInstallerAvailable();
	const selfManaged = $derived(updatesSelfManaged());
	const setting = $derived(
		automaticChecksSetting({
			selfManaged,
			unsupportedReason: updatesUnsupportedReason(),
			addonAvailable,
		}),
	);

	onMount(() => {
		if (setting.blocked) return;
		hydrateUpdateSettings().catch((error: unknown) => {
			showErrorToast({
				label: t("updates.settings.errors.loadFailed"),
				error,
			});
		});
	});
</script>

<SwitchField
	title={setting.title}
	description={setting.description}
	disabled={setting.blocked || stored === null}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			saveAutomaticChecks(newValue)
				.then((autoCheck) => {
					pending = null;
					if (autoCheck) {
						void checkAfterOptIn({ selfManaged, addonAvailable });
					}
				})
				.catch((error: unknown) => {
					pending = null;
					showErrorToast({
						label: t("updates.settings.errors.saveFailed"),
						error,
					});
				});
		}
	}
/>
{#if manualCheckOffered({ selfManaged, addonAvailable })}
	<CheckForUpdatesButton {selfManaged} {addonAvailable} />
{/if}
