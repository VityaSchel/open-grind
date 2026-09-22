<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";

	import {
		albumCoverContent,
		albumItemCountLabel,
		albumMediaCounts,
		readyAlbumMedia,
	} from "$lib/components/album/album";
	import AlbumNameField from "$lib/components/album/AlbumNameField.svelte";
	import AlbumPreview from "$lib/components/album/AlbumPreview.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { AlbumContent } from "$lib/model/messaging/albums";
	import type { PendingUpload } from "../album-uploads/album-uploads-state.svelte";
	import AlbumHeaderLayout from "./AlbumHeaderLayout.svelte";

	let {
		albumId,
		albumName = $bindable(),
		content,
		pending,
		maxPhotos = null,
		maxVideos = null,
		sharedCount,
		updatedLabel,
		onOpenShares,
	}: {
		albumId: number;
		albumName: string;
		content: AlbumContent[];
		pending: PendingUpload[];
		maxPhotos?: number | null;
		maxVideos?: number | null;
		sharedCount: number;
		updatedLabel: string;
		onOpenShares: () => void;
	} = $props();

	const counts = $derived(albumMediaCounts({ content, pending }));
	const itemCountLabel = $derived(
		maxPhotos === null || maxVideos === null
			? albumItemCountLabel(counts.photos + counts.videos)
			: `${counts.photos}/${maxPhotos} photos, ${counts.videos}/${maxVideos} videos`,
	);
	const cover = $derived(albumCoverContent(content));
	const readyMedia = $derived(readyAlbumMedia(content));
</script>

<AlbumHeaderLayout>
	{#snippet preview()}
		{#if cover === undefined}
			<MediaImage src={null} class="aspect-3/4 w-full rounded-xl" />
		{:else}
			<AlbumPreview
				{albumId}
				coverUrl={cover.thumbUrl}
				hasPhoto={readyMedia.hasPhoto}
				hasVideo={readyMedia.hasVideo}
				label="Preview album"
				class="aspect-3/4 w-full"
				contentClass="rounded-xl"
			/>
		{/if}
	{/snippet}
	<AlbumNameField bind:value={albumName} />
	<Button
		variant="ghost"
		class="mt-1 h-11 w-full justify-between"
		onclick={onOpenShares}
	>
		<span class="truncate">Shared with</span>
		<span class="flex items-center gap-1.5">
			<Badge variant="secondary">{sharedCount}</Badge>
			<CaretRightIcon class="size-4" />
		</span>
	</Button>
	<div
		class="flex items-baseline justify-between gap-2 px-1 text-xs text-muted-foreground"
	>
		<span class="truncate">Updated {updatedLabel}</span>
		<span class="shrink-0">{itemCountLabel}</span>
	</div>
</AlbumHeaderLayout>
