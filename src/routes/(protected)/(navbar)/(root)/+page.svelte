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

	let scrollRestored = false;
	$effect(() => {
		if (
			!scrollRestored &&
			gridContainer &&
			!gridState.loading &&
			gridState.error === null
		) {
			scrollRestored = true;
			gridContainer.scrollTop = gridState.scrollY;
		}
	});
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
		<main class="relative h-(--screen-nav) w-full -mb-(--content-pb)">
			<div
				class="h-full w-full overflow-auto overscroll-contain"
				bind:this={gridContainer}
				onscroll={() => (gridState.scrollY = gridContainer?.scrollTop ?? 0)}
			>
				<div
					class="@container/photo-grid flex min-h-overscrollable flex-col gap-4 px-4 pt-4 pb-nav-clear"
				>
					<TopBar />
					<Grid {geohash} />
				</div>
			</div>
			{#if !gridState.loading && !gridState.error}
				<DataRefreshControl
					container={gridContainer}
					updating={gridState.refreshing}
					position="top"
					containerClass="z-1"
					onrefresh={() => void gridState.reload()}
				/>
			{/if}
		</main>
	{/if}
{/await}
