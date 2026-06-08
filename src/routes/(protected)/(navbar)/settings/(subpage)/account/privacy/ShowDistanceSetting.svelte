<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error";
	import { getMyProfile, patchOwnProfile } from "$lib/api/users/profiles";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";

	let value = $state(false);
	let profileId = $state<number | null>(null);

	onMount(() => {
		getMyProfile()
			.then((profile) => {
				value = profile.showDistance;
				profileId = profile.profileId;
			})
			.catch((e) => {
				console.error("Failed to load profile", e);
			});
	});
</script>

<SwitchField
	title="Show my distance"
	description="Reveal your approximate location to other users as distance, e.g. 1.2 km."
	disabled={profileId === null}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			if (profileId === null) return;
			const previous = value;
			value = newValue;
			void patchOwnProfile(profileId, { showDistance: newValue }).catch(
				(error) => {
					value = previous;
					showErrorToast({ label: "Failed to update setting", error });
				},
			);
		}
	}
/>
