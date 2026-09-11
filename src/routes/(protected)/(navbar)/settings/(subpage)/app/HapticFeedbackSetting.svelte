<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";

	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? getPreferencesSnapshot().hapticFeedback);
</script>

<SwitchField
	title="Haptic feedback"
	description="Play a short tap when a swipe has gone far enough to reply."
	disabled={!preferencesLoaded()}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setPreferences({ hapticFeedback: newValue }).catch((error) => {
				pending = null;
				showErrorToast({ label: "Failed to save preferences", error });
			});
		}
	}
/>
