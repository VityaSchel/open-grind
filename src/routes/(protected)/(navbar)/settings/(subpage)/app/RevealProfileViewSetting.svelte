<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error";
	import {
		getPreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";

	let value = $state(false);
	let loaded = $state(false);

	onMount(() => {
		(async () => {
			const { revealProfileViews } = await getPreferences();
			value = revealProfileViews;
			loaded = true;
		})().catch((e) => {
			console.error("Failed to load preferences", e);
		});
	});
</script>

<SwitchField
	title="Reveal profile views"
	description="Let others know when you've viewed their profile. Your profile view history remains unaffected."
	disabled={!loaded}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			const previous = value;
			value = newValue;
			setPreferences({ revealProfileViews: newValue }).catch((error) => {
				value = previous;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
/>
