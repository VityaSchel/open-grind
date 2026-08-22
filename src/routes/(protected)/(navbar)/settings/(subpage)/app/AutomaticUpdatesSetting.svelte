<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { getUpdateSettings, setAutomaticUpdateChecks } from "$lib/updates";
	import { checkForUpdateNow } from "$lib/updates/updates-manager";

	let stored = $state<boolean | null>(null);
	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? stored ?? false);

	onMount(() => {
		getUpdateSettings()
			.then((settings) => {
				stored = settings.autoCheck;
			})
			.catch((error: unknown) => {
				showErrorToast({
					label: "Couldn't read update settings",
					error,
				});
			});
	});
</script>

<SwitchField
	title="Check updates automatically"
	description="Periodically request updates from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed."
	disabled={stored === null}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setAutomaticUpdateChecks(newValue)
				.then((settings) => {
					stored = settings.autoCheck;
					pending = null;
					if (settings.autoCheck) void checkForUpdateNow();
				})
				.catch((error: unknown) => {
					pending = null;
					showErrorToast({
						label: "Couldn't save update settings",
						error,
					});
				});
		}
	}
/>
