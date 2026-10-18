<script lang="ts">
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import { prefersReducedMotion } from "svelte/motion";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import PagingSentinel from "$lib/components/shared/PagingSentinel.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import type { GiphyTile } from "$lib/api/messaging/gifs";
	import GifBadge from "../../../giphy/GifBadge.svelte";
	import StickerLoadFailure from "../StickerLoadFailure.svelte";
	import StickerTile from "../StickerTile.svelte";
	import type { GifFeed } from "./gif-feed.svelte";

	let {
		feed,
		pickedId,
		onToggle,
	}: {
		feed: GifFeed;
		pickedId: string | null;
		onToggle: (gif: GiphyTile) => void;
	} = $props();

	const SKELETON_COUNT = 12;
	const TILE_ASPECT = "4 / 3";
	const GRID_CLASS =
		"grid grid-cols-1 gap-1 @gif2/sticker-grid:grid-cols-2 @gif3/sticker-grid:grid-cols-3";
</script>

<div
	data-slot="gif-results"
	class="@container/sticker-grid flex flex-1 flex-col pt-2"
>
	{#if feed.loading}
		<div
			data-slot="sticker-grid-skeleton"
			aria-busy="true"
			class={GRID_CLASS}
		>
			{#each { length: SKELETON_COUNT }, index (index)}
				{@render skeletonTile()}
			{/each}
		</div>
	{:else if feed.error}
		<StickerLoadFailure
			message="Couldn't load GIFs"
			onRetry={() => feed.retry()}
		/>
	{:else if feed.empty}
		<Empty.Root class="flex-1">
			<Empty.Header>
				<Empty.Media variant="icon">
					<MagnifyingGlassIcon weight="bold" />
				</Empty.Media>
				<Empty.Title>No GIFs found</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div data-slot="sticker-grid" class={GRID_CLASS}>
			{#each feed.gifs as gif (gif.id)}
				<StickerTile
					label={gif.alt}
					selected={gif.id === pickedId}
					onclick={() => onToggle(gif)}
					class="aspect-4/3 bg-muted"
				>
					<MediaImage
						src={prefersReducedMotion.current
							? gif.stillTileUrl
							: gif.tileUrl}
						alt={gif.alt}
						loading="lazy"
						fallbackAspectRatio={TILE_ASPECT}
						class="size-full rounded-[inherit]"
					/>
					{#if prefersReducedMotion.current}
						<GifBadge />
					{/if}
				</StickerTile>
			{/each}
			{#if feed.paging.running}
				{@render skeletonTile()}
				{@render skeletonTile("hidden @gif2/sticker-grid:block")}
				{@render skeletonTile("hidden @gif3/sticker-grid:block")}
			{/if}
		</div>
		<div role="status" class="sr-only">
			{feed.paging.running
				? "Loading more GIFs"
				: feed.paging.failure
					? "Couldn't load more GIFs"
					: ""}
		</div>
		{#if feed.paging.failure}
			<StickerLoadFailure
				message="Couldn't load more GIFs"
				onRetry={() => feed.paging.retry()}
			/>
		{/if}
		{#if feed.nextOffset !== null}
			<PagingSentinel
				paging={feed.paging}
				data-slot="gif-paging-sentinel"
				class="h-0"
			/>
		{/if}
	{/if}
</div>

{#snippet skeletonTile(className?: string)}
	<MediaImage
		src={null}
		pending
		class={["aspect-4/3 rounded-lg", className]}
	/>
{/snippet}
