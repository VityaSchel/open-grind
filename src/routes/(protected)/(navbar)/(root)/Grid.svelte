<script lang="ts">
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { virtualGrid } from "$lib/util/virtual-grid.svelte";
	import EmptyGrid from "./EmptyGrid.svelte";
	import GridCellSkeleton from "./GridCellSkeleton.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

	const PAGE_SKELETONS = 20;

	let { geohash }: { geohash: string } = $props();

	let gridElement: HTMLElement | null = $state(null);

	const pendingSkeletons = $derived(
		gridState.loadingMore ? PAGE_SKELETONS : 0,
	);
	const view = virtualGrid({
		grid: () => gridElement,
		count: () => gridState.profiles.length + pendingSkeletons,
	});
	const visibleProfiles = $derived(
		gridState.profiles.slice(view.startIndex, view.endIndex),
	);
	const visibleSkeletons = $derived(
		Math.max(
			0,
			view.endIndex -
				Math.max(view.startIndex, gridState.profiles.length),
		),
	);

	$effect.pre(() => {
		gridState.load(geohash);
	});

	$effect(() => {
		gridState.viewActive = true;
		return () => {
			gridState.viewActive = false;
		};
	});
</script>

<div class="relative flex flex-1 flex-col">
	<div
		bind:this={gridElement}
		data-slot="grid-cells"
		class="photo-grid"
		style:padding-top="{view.paddingTopPx}px"
		style:padding-bottom="{view.paddingBottomPx}px"
		data-rows-above={view.hasRowsAbove || undefined}
		data-rows-below={view.hasRowsBelow || undefined}
	>
		{#if gridState.loading && gridState.profiles.length === 0}
			{#each Array.from({ length: PAGE_SKELETONS })}
				<GridCellSkeleton />
			{/each}
		{:else if gridState.error && gridState.profiles.length === 0}
			<div class="col-span-full flex p-4">
				<ApiErrorDisplay
					error={gridState.error}
					onRetry={() => gridState.retry()}
					class="m-auto"
				/>
			</div>
		{:else}
			{#if gridState.profiles.length === 0}
				<EmptyGrid />
			{/if}
			{#each visibleProfiles as item (item.id)}
				{#if item.type === "rendered"}
					<GridProfileMiniCard
						id={item.id}
						displayName={item.displayName}
						distance={item.distance}
						unread={item.unread}
						onlineUntil={item.onlineUntil}
						isFavorite={item.isFavorite}
						isVisiting={item.isVisiting}
						hadRecentChat={item.hasChattedInLast24Hrs}
						medias={item.profilePhotosHashes?.map((mediaHash) => ({
							mediaHash,
						})) ?? []}
					/>
				{:else}
					<GridCellSkeleton
						onVisible={() => {
							gridState
								.resolveProfile(item.id)
								.catch((error) => console.error(error));
						}}
					/>
				{/if}
			{/each}
			{#each Array.from({ length: visibleSkeletons })}
				<GridCellSkeleton />
			{/each}
		{/if}
	</div>
	<div role="status" class="sr-only">
		{#if gridState.loadingMore}
			Loading more profiles
		{/if}
	</div>
	{#if gridState.nextPage !== 0 && gridState.nextPage !== null}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 h-px"
			use:observeIntersection={{
				handle: () => gridState.loadMore(),
				rootMargin: "400px",
			}}
		></div>
	{/if}
</div>
