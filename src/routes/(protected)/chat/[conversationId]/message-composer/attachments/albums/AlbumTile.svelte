<script lang="ts">
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";
	import VideoIcon from "phosphor-svelte/lib/VideoIcon";
	import { expoOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionOverlay from "$lib/components/shared/SelectionOverlay.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { MyAlbum } from "$lib/model/messaging/albums";

	let {
		album,
		selected,
		shared,
		dimmed,
		disabled,
		clickable,
		onclick,
	}: {
		album: MyAlbum;
		selected: boolean;
		shared: boolean;
		dimmed: boolean;
		disabled: boolean;
		clickable: boolean;
		onclick: () => void;
	} = $props();

	const hasVideo = $derived(
		album.content.some((item) => item.contentType.startsWith("video/")),
	);
</script>

<button
	type="button"
	data-slot="album-tile"
	class={[
		"relative isolate flex aspect-(--photo-grid-aspect) items-end overflow-hidden transition-opacity",
		{ "cursor-pointer": clickable, "opacity-50": dimmed },
	]}
	aria-pressed={selected}
	{disabled}
	{onclick}
>
	<MediaImage
		src={proxyMediaUrl(album.content[0]?.thumbUrl)}
		loading="lazy"
		class="absolute inset-0 size-full rounded-[inherit]"
		imgClass="bg-card-foreground/10"
	/>
	<div class="z-1 flex w-full items-center p-1.5">
		<Badge
			variant="outline"
			class="min-w-0 bg-popover/20 backdrop-blur-2xl"
		>
			<span class="truncate font-semibold">
				{album.albumName || "Untitled album"}
			</span>
		</Badge>
	</div>
	{#if shared}
		<div
			class="absolute top-3/4 left-1/2 z-1 -translate-x-1/2 -translate-y-1/2"
			transition:fade={{ duration: 400, easing: expoOut }}
		>
			<Badge
				data-slot="album-shared-badge"
				variant="outline"
				class="border-white/10 bg-muted/80"
			>
				Shared
			</Badge>
		</div>
	{/if}
	<div
		class="absolute inset-s-1.5 top-1.5 z-1 flex gap-1 text-2xs font-semibold *:flex *:h-6 *:min-w-6 *:items-center *:justify-center *:gap-1 *:rounded-full *:border *:border-white/10 *:bg-popover/40 *:backdrop-blur-2xl"
	>
		<div class="px-1.5">
			<ImagesIcon weight="fill" class="size-3.5" />
			{album.content.length}<span class="sr-only">
				{#if album.content.length === 1}
					item
				{:else}
					items
				{/if}
			</span>
		</div>
		{#if hasVideo}
			<div>
				<VideoIcon weight="fill" class="size-3.5" />
				<span class="sr-only">contains video</span>
			</div>
		{/if}
	</div>
	{#if selected}
		<SelectionOverlay class="z-2" />
	{:else if !album.isShareable}
		<div
			data-slot="album-locked"
			class="absolute inset-0 z-2 flex items-center justify-center rounded-[inherit] bg-black/60 text-white"
		>
			<LockSimpleIcon weight="fill" class="size-6" />
			<span class="sr-only">can't be shared</span>
		</div>
	{/if}
</button>
