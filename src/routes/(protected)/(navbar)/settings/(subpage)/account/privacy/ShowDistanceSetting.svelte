<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { getProfile, patchOwnProfile } from "#lib/api/users/profiles.ts";
	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { formatDistance } from "#lib/util/units.ts";

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
	title={t("settings.privacy.showDistance.title")}
	description={t("settings.privacy.showDistance.description", {
		distance: exampleDistance,
	})}
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
				showErrorToast({
					label: t("settings.setting.errors.saveFailed"),
					error,
				});
			});
		}
	}
/>
