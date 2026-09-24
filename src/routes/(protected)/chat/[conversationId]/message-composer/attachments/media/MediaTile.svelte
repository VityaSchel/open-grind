<script lang="ts">
	import MediaSheetTile from "$lib/components/media-sheet/MediaSheetTile.svelte";
	import { mediaFileKindOf } from "$lib/platform/media-file";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { DrawerMedia } from "$lib/api/messaging/drawer";
	import SentOverlay from "./SentOverlay.svelte";

	let {
		item,
		index,
		selected,
		clickable,
		busy = false,
		lifted = false,
		onclick,
		onMenu,
	}: {
		item: DrawerMedia;
		index: number;
		selected: boolean;
		clickable: boolean;
		busy?: boolean;
		lifted?: boolean;
		onclick: () => void;
		onMenu?: (tile: HTMLButtonElement) => void;
	} = $props();

	const video = $derived(mediaFileKindOf(item.contentType) === "video");
</script>

<MediaSheetTile
	src={proxyMediaUrl(item.url, { as: video ? "video" : "image" })}
	{video}
	{index}
	{selected}
	{clickable}
	{busy}
	{lifted}
	{onclick}
	{onMenu}
>
	{#snippet overlay()}
		{#if item.used}
			<SentOverlay />
		{/if}
	{/snippet}
</MediaSheetTile>
