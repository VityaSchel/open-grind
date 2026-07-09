<script lang="ts">
	import {
		getGeohashSnapshot,
		hydratePreferences,
	} from "$lib/app-data/preferences.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import Grid from "./Grid.svelte";
	import LocationChooser from "./LocationEmpty.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	const preferencesHydrated = hydratePreferences();
	const geohash = $derived(getGeohashSnapshot());

	let gridContainer: HTMLElement | null = $state(null);
</script>

<svelte:head>
	<title>Open Grind</title>
</svelte:head>
{#await preferencesHydrated then}
	{#if geohash === null}
		<main class="m-auto flex max-w-full flex-1">
			<LocationChooser />
		</main>
	{:else}
		<main
			class="flex min-h-[calc(var(--screen-scroll)+3.5rem)] flex-col gap-4 p-4"
		>
			<TopBar />
			<div
				class="@container/photo-grid flex flex-col"
				bind:this={gridContainer}
			>
				{#if !gridState.loading && !gridState.error}
					<DataRefreshControl
						container={gridContainer}
						windowScroll
						updating={gridState.refreshing}
						position="top"
						class="mb-3"
						containerClass="z-1"
						onclick={() => void gridState.reload()}
					/>
				{/if}
				<Grid {geohash} />
			</div>
		</main>
	{/if}
{/await}
