<script lang="ts">
	import type { Snippet } from "svelte";

	import {
		hydratePreferences,
		preferencesSnapshot,
	} from "#lib/app-data/preferences.svelte.ts";
	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import LocationEmpty from "#lib/components/location-chooser/LocationEmpty.svelte";

	let { children }: { children: Snippet<[{ geohash: string }]> } = $props();

	let preferencesHydrated = $state(hydratePreferences());
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
{:catch error}
	<main class="m-auto flex max-w-full flex-1">
		<ApiErrorDisplay
			{error}
			onRetry={() => (preferencesHydrated = hydratePreferences())}
			class="m-auto"
		/>
	</main>
{/await}
