<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getProfile, patchOwnProfile } from "$lib/api/users/profiles";
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { formatDistance } from "$lib/util/units";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const EXAMPLE_DISTANCE_METRES = 2400;

	let value = $state(false);
	let loaded = $state(false);
	const exampleDistance = $derived(
		formatDistance(EXAMPLE_DISTANCE_METRES, preferencesSnapshot().units),
	);

	onMount(() => {
		getProfile(ourProfileId)
			.then((profile) => {
				value = profile.showDistance;
				loaded = true;
			})
			.catch((e) => {
				console.error("Failed to load profile", e);
			});
	});
</script>

<SwitchField
	title="Show my distance"
	description="Reveal your approximate location to other users as distance, e.g. {exampleDistance}."
	disabled={!loaded}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			if (!loaded) return;
			const previous = value;
			value = newValue;
			void patchOwnProfile({
				cacheProfileId: ourProfileId,
				patch: { showDistance: newValue },
			}).catch((error) => {
				value = previous;
				showErrorToast({ label: "Failed to update setting", error });
			});
		}
	}
/>
