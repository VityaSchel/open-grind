<script lang="ts">
	import { getPreferences } from "$lib/app-data/preferences.svelte";
	import DataRefreshControl from "$lib/components/DataRefreshControl.svelte";
	import { gridState } from "./grid-state.svelte";
	import Grid from "./Grid.svelte";
	import LocationChooser from "./LocationEmpty.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	let preferences = $state(getPreferences());

	let topBar: TopBar | null = $state(null);
	let gridContainer: HTMLElement | null = $state(null);
</script>

<svelte:head>
	<title>Open Grind</title>
</svelte:head>
{#await preferences then { geohash }}
	{#if geohash === null}
		<main class="m-auto flex flex-1 max-w-full">
			<LocationChooser onUpdate={() => (preferences = getPreferences())} />
		</main>
	{:else}
		<main class="flex flex-col p-4 gap-4">
			<TopBar
				onUpdatePreferences={() => (preferences = getPreferences())}
				onRefreshGrid={() => gridState.refresh()}
				bind:this={topBar}
			/>
			<div class="flex flex-col gap-4" bind:this={gridContainer}>
				<DataRefreshControl
					container={gridContainer}
					windowScroll
					updating={gridState.refreshing}
					position="top"
					class="mb-3"
					onclick={() => void gridState.reload()}
				/>
				<Grid {geohash} onResetFilters={() => void topBar?.resetFilters()} />
			</div>
		</main>
	{/if}
{/await}
