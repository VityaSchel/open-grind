<script lang="ts">
	import {
		hydratePreferences,
		preferencesSnapshot,
	} from "#lib/app-data/preferences.svelte.ts";
	import LocationChooser from "#lib/components/location-chooser/LocationEmpty.svelte";
	import RightNowFeedScreen from "./RightNowFeedScreen.svelte";

	let { data }: import("./$types").PageProps = $props();

	const preferencesHydrated = hydratePreferences();
	const geohash = $derived(preferencesSnapshot().geohash);
</script>

{#await preferencesHydrated then}
	{#if geohash === null}
		<main class="m-auto flex max-w-full flex-1">
			<LocationChooser />
		</main>
	{:else}
		<RightNowFeedScreen ourProfileId={data.ourProfileId} {geohash} />
	{/if}
{/await}
