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
	import {
		albumCoverContent,
		albumDisplayName,
		albumItemCountLabel,
		readyAlbumMedia,
	} from "./album";

	let {
		album,
		href,
		selected = false,
		shared = false,
		shareLocked = false,
		dimmed = false,
		disabled = false,
		clickable = true,
		onclick,
	}: {
		album: MyAlbum;
		href?: string;
		selected?: boolean;
		shared?: boolean;
		shareLocked?: boolean;
		dimmed?: boolean;
		disabled?: boolean;
		clickable?: boolean;
		onclick?: () => void;
	} = $props();

	const readyMedia = $derived(readyAlbumMedia(album.content));
	const tileClass: import("svelte/elements").ClassValue = $derived([
		"relative isolate flex aspect-(--photo-grid-aspect) items-end overflow-hidden transition-opacity",
		{ "cursor-pointer": clickable, "opacity-50": dimmed },
	]);
</script>

{#snippet body()}
	<MediaImage
		src={proxyMediaUrl(albumCoverContent(album.content)?.thumbUrl)}
		loading="lazy"
		class="absolute inset-0 size-full rounded-[inherit]"
		imgClass="bg-card-foreground/10"
	/>
	<div class="z-1 flex w-full items-center p-1.5">
		<Badge
			variant="outline"
			class="min-w-0 bg-popover/20 scrim backdrop-filter-(--bd-chip)"
		>
			<span class="truncate font-semibold">
				{albumDisplayName(album.albumName)}
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
		class="absolute inset-s-1.5 top-1.5 z-1 flex gap-1 text-2xs font-semibold *:flex *:h-6 *:min-w-6 *:items-center *:justify-center *:gap-1 *:rounded-full *:border *:border-white/10 *:bg-popover/40 *:scrim *:backdrop-filter-(--bd-chip)"
	>
		<div data-slot="album-count-badge" class="px-1.5">
			<ImagesIcon weight="fill" class="size-3.5" />
			<span aria-hidden="true">{readyMedia.count}</span>
			<span class="sr-only">
				{albumItemCountLabel(readyMedia.count)}
			</span>
		</div>
		{#if readyMedia.hasVideo}
			<div data-slot="album-video-badge">
				<VideoIcon weight="fill" class="size-3.5" />
				<span class="sr-only">contains video</span>
			</div>
		{/if}
	</div>
	{#if selected}
		<SelectionOverlay class="z-2" />
	{:else if shareLocked}
		<div
			data-slot="album-locked"
			class="absolute inset-0 z-2 flex items-center justify-center rounded-[inherit] bg-black/60 text-white"
		>
			<LockSimpleIcon weight="fill" class="size-6" />
			<span class="sr-only">can't be shared</span>
		</div>
	{/if}
{/snippet}

{#if href === undefined}
	<button
		type="button"
		data-slot="album-tile"
		class={tileClass}
		aria-pressed={selected}
		{disabled}
		{onclick}
	>
		{@render body()}
	</button>
{:else}
	<a {href} data-slot="album-tile" class={tileClass}>
		{@render body()}
	</a>
{/if}
