<script lang="ts">
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { t } from "#lib/i18n/index.ts";
	import {
		desktopEntryInstalled,
		setDesktopEntryInstalled,
	} from "#lib/platform/desktop-entry.svelte.ts";

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? desktopEntryInstalled());
</script>

<SwitchField
	title={t("settings.app.appsMenuEntry.title")}
	description={t("settings.app.appsMenuEntry.description")}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setDesktopEntryInstalled(newValue)
				.catch((error: unknown) => {
					showErrorToast({
						label: newValue
							? t("common.desktopEntry.errors.addFailed")
							: t("common.desktopEntry.errors.removeFailed"),
						error,
					});
				})
				.finally(() => (pending = null));
		}
	}
/>
