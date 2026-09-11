<script lang="ts">
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";

	import { isVideoContent } from "$lib/components/album/album";
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { AlbumContent } from "$lib/model/messaging/albums";

	let {
		content,
		removed,
		saving,
		onToggleRemoved,
		onReorder,
	}: {
		content: AlbumContent[];
		removed: number[];
		saving: boolean;
		onToggleRemoved: (contentId: number) => void;
		onReorder: (move: { from: number; to: number }) => void;
	} = $props();

	const removedKeys = $derived(
		new Set(removed.map((contentId) => String(contentId))),
	);

	const slots = $derived(
		content.map((item, index) => {
			const video = isVideoContent(item.contentType);
			const label = `${video ? "video" : "photo"} in slot ${index + 1}`;
			return {
				key: String(item.contentId),
				src: proxyMediaUrl(item.thumbUrl),
				alt: `Album ${label}`,
				deleteLabel: `Remove album ${label}`,
				undoLabel: `Keep album ${label}`,
				video,
				onDelete: () => onToggleRemoved(item.contentId),
			};
		}),
	);
</script>

{#if slots.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<ImagesIcon weight="fill" />
			</Empty.Media>
			<Empty.Title>No media yet</Empty.Title>
			<Empty.Description>
				Photos and videos you add appear here.
			</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<MediaSlotGrid
		{slots}
		removed={removedKeys}
		disabled={saving}
		{onReorder}
	/>
{/if}
