<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		type BooleanPreference,
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";

	let {
		preference,
		title,
		description,
	}: { preference: BooleanPreference; title: string; description: string } =
		$props();

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? preferencesSnapshot()[preference]);
</script>

<SwitchField
	{title}
	{description}
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ [preference]: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
/>
