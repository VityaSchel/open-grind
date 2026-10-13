<script lang="ts">
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionOverlay from "$lib/components/shared/SelectionOverlay.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { SelectionSet } from "$lib/util/selection.svelte";
	import type { GifFeed } from "./gif-feed.svelte";

	let {
		feed,
		selected,
		onToggle,
	}: {
		feed: GifFeed;
		selected: SelectionSet<string>;
		onToggle: (id: string) => void;
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
		{@render failure({
			message: "Couldn't load GIFs",
			onRetry: () => feed.retry(),
		})}
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
				{@const isSelected = selected.has(gif.id)}
				<button
					type="button"
					data-slot="sticker-tile"
					class="relative aspect-4/3 cursor-pointer scroll-mt-18 rounded-lg bg-muted"
					aria-label={gif.alt}
					aria-pressed={isSelected}
					onclick={() => onToggle(gif.id)}
				>
					<MediaImage
						src={gif.tileUrl}
						alt={gif.alt}
						loading="lazy"
						fallbackAspectRatio={TILE_ASPECT}
						class="size-full rounded-[inherit]"
					/>
					{#if isSelected}
						<SelectionOverlay />
					{/if}
				</button>
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
			{@render failure({
				message: "Couldn't load more GIFs",
				onRetry: () => feed.paging.retry(),
			})}
		{/if}
		{#if feed.nextOffset !== null}
			{#key feed.paging.armToken}
				<div
					data-slot="gif-paging-sentinel"
					class="h-0"
					use:observeIntersection={{
						handle: () => feed.paging.run(),
						rootMargin: "400px",
					}}
				></div>
			{/key}
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

{#snippet failure({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
})}
	<div data-slot="gif-error" class="flex flex-col items-center gap-2 p-4">
		<p class="text-center text-sm text-muted-foreground">{message}</p>
		<Button size="sm" onclick={onRetry}>Retry</Button>
	</div>
{/snippet}
