<script lang="ts">
	import { uniqBy } from "lodash-es";
	import { onMount } from "svelte";

	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import EmptyGrid from "./EmptyGrid.svelte";
	import { gridState } from "./grid-state.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

	let {
		geohash,
		onResetFilters,
	}: {
		geohash: string;
		onResetFilters: () => void;
	} = $props();

	const gridProfiles = $derived(uniqBy(gridState.items, "id"));

	$effect.pre(() => {
		gridState.load(geohash);
	});

	export function refresh() {
		gridState.refresh();
	}

	onMount(() => {
		const saveScroll = () => {
			gridState.scrollY = window.scrollY;
		};
		window.addEventListener("scroll", saveScroll, { passive: true });
		return () => window.removeEventListener("scroll", saveScroll);
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

<div class="profile-grid relative">
	{#if gridState.loading}
		{#each Array.from({ length: 20 })}
			<div class="aspect-square bg-stone-700 animate-pulse"></div>
		{/each}
	{:else if gridState.error}
		<div class="p-4 flex col-span-full">
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
					class="aspect-square bg-stone-700 animate-pulse"
					use:observePartial={{ batchIndex: item.batchIndex }}
				></div>
			{/if}
		{:else}
			<EmptyGrid {onResetFilters} />
		{/each}
		{#if gridState.loadingMore}
			{#each Array.from({ length: 20 })}
				<div class="aspect-square bg-stone-700 animate-pulse"></div>
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
