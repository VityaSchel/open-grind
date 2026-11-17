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

{#snippet fallback(failure: { error: unknown } | null)}
	<main class="screen-nav-host">
		<div class="size-full overflow-y-auto overscroll-none">
			<div class="flex min-h-full w-full pb-nav-clear">
				<div class="m-auto flex max-w-full">
					{#if failure === null}
						<LocationEmpty />
					{:else}
						<ApiErrorDisplay
							error={failure.error}
							onRetry={() =>
								(preferencesHydrated = hydratePreferences())}
							class="m-auto"
						/>
					{/if}
				</div>
			</div>
		</div>
	</main>
{/snippet}

{#await preferencesHydrated then}
	{#if geohash === null}
		{@render fallback(null)}
	{:else}
		{@render children({ geohash })}
	{/if}
{:catch error}
	{@render fallback({ error })}
{/await}
