<script lang="ts">
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { GridProfile } from "$lib/grid/grid";
	import EmptyGrid from "./EmptyGrid.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

	let { geohash }: { geohash: string } = $props();

	const gridProfiles = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and spread inside this $derived, never mutated afterwards
		const byId = new Map<number, GridProfile>();
		for (const item of gridState.items) {
			const existing = byId.get(item.id);
			if (
				!existing ||
				(existing.type === "lazy" && item.type === "rendered")
			) {
				byId.set(item.id, item);
			}
		}
		return [...byId.values()];
	});

	$effect.pre(() => {
		gridState.load(geohash);
	});
</script>

<div class="photo-grid relative">
	{#if gridState.loading}
		{#each Array.from({ length: 20 })}
			<div class="aspect-square animate-pulse bg-stone-700"></div>
		{/each}
	{:else if gridState.error}
		<div class="col-span-full flex p-4">
			<ApiErrorDisplay
				error={gridState.error}
				onRetry={() => gridState.retry()}
				class="m-auto"
			/>
		</div>
	{:else}
		{#each gridProfiles as item (item.id)}
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
				<div
					class="aspect-square animate-pulse bg-stone-700"
					use:observeIntersection={{
						handle: () => {
							gridState
								.resolveProfile(item.id)
								.catch((error) => console.error(error));
						},
						root: "scroller",
						rootMargin: "200px",
					}}
				></div>
			{/if}
		{:else}
			<EmptyGrid />
		{/each}
		{#if gridState.loadingMore}
			{#each Array.from({ length: 20 })}
				<div class="aspect-square animate-pulse bg-stone-700"></div>
			{/each}
		{/if}
		{#if gridState.nextPage !== 0 && gridState.nextPage !== null}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 h-px"
				use:observeIntersection={{
					handle: () => {
						gridState
							.loadMore()
							.catch((error) => console.error(error));
					},
					root: "scroller",
					rootMargin: "400px",
				}}
			></div>
		{/if}
	{/if}
</div>
