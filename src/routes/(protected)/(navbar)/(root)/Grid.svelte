<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";
	import { uniqBy } from "lodash-es";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import EmptyGrid from "./EmptyGrid.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

	let {
		geohash,
	}: {
		geohash: string;
	} = $props();

	const gridProfiles = $derived(uniqBy(gridState.items, "id"));

	$effect.pre(() => {
		gridState.load(geohash);
	});

	export function refresh() {
		gridState.refresh();
	}

	beforeNavigate(() => {
		gridState.scrollY = window.scrollY;
	});

	afterNavigate((navigation) => {
		if (navigation.type === "popstate") return;
		if (!gridState.loading && gridState.error === null) {
			window.scrollTo({ top: gridState.scrollY, behavior: "instant" });
		}
	});

	let scrolled = $state(false);
	$effect(() => {
		if (!scrolled && !gridState.loading && gridState.errorMessage === null) {
			scrolled = true;
			window.scrollTo({ top: gridState.scrollY, behavior: "instant" });
		}
	});

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting)
					gridState.loadMore().catch((error) => console.error(error));
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}

	function observePartial(node: HTMLElement, params: { batchIndex: number }) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					gridState
						.loadBatch(params.batchIndex)
						.catch((error) => console.error(error));
					observer.disconnect();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
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
				onRetry={() => gridState.refresh()}
				class="m-auto"
			/>
		</div>
	{:else}
		{#each gridProfiles as item (item.id)}
			{#if item.type === "full"}
				<GridProfileMiniCard
					id={item.id}
					displayName={item.displayName}
					distance={item.distance}
					unread={item.unread}
					onlineUntil={item.onlineUntil}
					isFavorite={item.isFavorite}
					hadRecentChat={item.hasChattedInLast24Hrs}
					medias={item.profilePhotosHashes?.map((mediaHash) => ({
						mediaHash,
					})) ?? []}
				/>
			{:else}
				<div
					class="aspect-square animate-pulse bg-stone-700"
					use:observePartial={{ batchIndex: item.batchIndex }}
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
				use:observeSentinel
			></div>
		{/if}
	{/if}
</div>
