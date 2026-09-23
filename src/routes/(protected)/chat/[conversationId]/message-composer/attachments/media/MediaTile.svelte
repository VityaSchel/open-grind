<script lang="ts">
	import VideoIcon from "phosphor-svelte/lib/VideoIcon";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionOverlay from "$lib/components/shared/SelectionOverlay.svelte";
	import VideoPreview from "$lib/components/shared/VideoPreview.svelte";
	import { mediaFileKindOf } from "$lib/platform/media-file";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { DrawerMedia } from "$lib/api/messaging/drawer";

	let {
		item,
		index,
		selected,
		clickable,
		onclick,
	}: {
		item: DrawerMedia;
		index: number;
		selected: boolean;
		clickable: boolean;
		onclick: () => void;
	} = $props();

	const video = $derived(mediaFileKindOf(item.contentType) === "video");
</script>

<button
	type="button"
	data-slot="media-tile"
	class={[
		"relative aspect-(--photo-grid-aspect)",
		{ "cursor-pointer": clickable },
	]}
	aria-label={video ? `Video ${index + 1}` : undefined}
	aria-pressed={selected}
	{onclick}
>
	{#if video}
		<VideoPreview
			src={proxyMediaUrl(item.url, { as: "video" })}
			class="size-full rounded-[inherit] bg-card-foreground/10"
		/>
		<div
			data-slot="media-tile-video-badge"
			class="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center media-chip backdrop-filter-(--bd-chip)"
		>
			<VideoIcon weight="fill" class="size-3.5" />
		</div>
	{:else}
		<MediaImage
			src={proxyMediaUrl(item.url)}
			alt="Photo {index + 1}"
			loading="lazy"
			class="size-full rounded-[inherit]"
			imgClass="bg-card-foreground/10"
		/>
	{/if}
	{#if selected}
		<SelectionOverlay />
	{:else if item.used}
		<div
			class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/50"
		>
			<span class="font-medium text-white">Sent</span>
		</div>
	{/if}
</button>
