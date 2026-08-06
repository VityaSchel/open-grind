<script lang="ts">
	import {
		getPreferencesSnapshot,
		hydratePreferences,
	} from "$lib/app-data/preferences.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import Grid from "./Grid.svelte";
	import LocationChooser from "./LocationEmpty.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	const preferencesHydrated = hydratePreferences();
	const geohash = $derived(getPreferencesSnapshot().geohash);

	let gridContainer: HTMLElement | null = $state(null);

	restoreScrollOnce(() => gridContainer, gridState);
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
		<main class="screen-nav-host">
			<TopBar />
			<div
				class="pull-scroller"
				bind:this={gridContainer}
				onscroll={() =>
					(gridState.scrollY = gridContainer?.scrollTop ?? 0)}
			>
				<div
					class="@container/photo-grid flex min-h-overscrollable flex-col gap-4 px-4 pt-17 pb-nav-clear"
				>
					<Grid {geohash} />
				</div>
			</div>
			{#if !gridState.loading && !gridState.error}
				<DataRefreshControl
					container={gridContainer}
					updating={gridState.refreshing}
					position="top"
					onrefresh={() => void gridState.refresh()}
				/>
			{/if}
		</main>
	{/if}
{/await}
