<script lang="ts">
	import type { Snippet } from "svelte";

	import {
		hydratePreferences,
		preferencesSnapshot,
	} from "#lib/app-data/preferences.svelte.ts";
	import LocationEmpty from "#lib/components/location-chooser/LocationEmpty.svelte";

	let { children }: { children: Snippet<[{ geohash: string }]> } = $props();

	const preferencesHydrated = hydratePreferences();
	const geohash = $derived(preferencesSnapshot().geohash);
</script>

{#await preferencesHydrated then}
	{#if geohash === null}
		<main class="m-auto flex max-w-full flex-1">
			<LocationEmpty />
		</main>
	{:else}
		{@render children({ geohash })}
	{/if}
{/await}
