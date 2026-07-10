<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import type { GridProfile } from "$lib/grid/grid";
	import EmptyGrid from "./EmptyGrid.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

	let {
		geohash,
	}: {
		geohash: string;
	} = $props();

	const gridProfiles = $derived.by(() => {
		const byId = new Map<number, GridProfile>();
		for (const item of gridState.items) {
			const existing = byId.get(item.id);
			if (!existing || (existing.type === "lazy" && item.type === "rendered")) {
				byId.set(item.id, item);
			}
		}
		return [...byId.values()];
	});

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

	function observeLazy(node: HTMLElement, params: { id: number }) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					gridState
						.resolveProfile(params.id)
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
					use:observeLazy={{ id: item.id }}
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
