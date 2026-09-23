<script lang="ts">
	import {
		albumMediaCounts,
		isVideoContent,
	} from "$lib/components/album/album";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { AlbumContent } from "$lib/model/messaging/albums";
	import { addAlbumMedia } from "../album-uploads/add-album-media";
	import type {
		AlbumUploads,
		PendingUpload,
		UploadLimits,
	} from "../album-uploads/album-uploads-state.svelte";
	import AlbumMediaEmpty from "./AlbumMediaEmpty.svelte";

	let {
		uploads,
		albumId,
		content,
		pending,
		removed,
		saving,
		limits,
		onToggleRemoved,
		onReorder,
	}: {
		uploads: AlbumUploads;
		albumId: number;
		content: AlbumContent[];
		pending: PendingUpload[];
		removed: number[];
		saving: boolean;
		limits: UploadLimits | null;
		onToggleRemoved: (contentId: number) => void;
		onReorder: (move: { from: number; to: number }) => void;
	} = $props();

	let adding = $state(false);

	const removedKeys = $derived(
		new Set(removed.map((contentId) => String(contentId))),
	);

	const pendingSlots = $derived(
		pending.map(({ key, kind }) => ({
			key: `pending:${key}`,
			src: null,
			alt: kind === "video" ? "Uploading video" : "Uploading photo",
			video: kind === "video",
			pending: true,
		})),
	);

	const contentSlots = $derived(
		content.map((item, index) => {
			const video = isVideoContent(item.contentType);
			const label = `${video ? "video" : "photo"} in slot ${index + 1}`;
			return {
				key: String(item.contentId),
				src: proxyMediaUrl(item.thumbUrl),
				alt: item.processing
					? `Album ${label}, processing`
					: `Album ${label}`,
				deleteLabel: `Remove album ${label}`,
				undoLabel: `Keep album ${label}`,
				video,
				pending: item.processing,
				onDelete: () => onToggleRemoved(item.contentId),
			};
		}),
	);

	const slots = $derived([...pendingSlots, ...contentSlots]);

	const photos = $derived(albumMediaCounts({ content, pending }).photos);

	const full = $derived(
		limits !== null && photos >= limits.maxContentItemsPerAlbum,
	);

	async function add() {
		adding = true;
		try {
			await addAlbumMedia({ uploads, albumId, content: () => content });
		} finally {
			adding = false;
		}
	}
</script>

{#if slots.length === 0}
	<AlbumMediaEmpty
		title="No media yet"
		description="Photos and videos you add appear here."
		disabled={saving || adding || full}
		onAdd={() => void add()}
	/>
{:else}
	<MediaSlotGrid
		{slots}
		removed={removedKeys}
		disabled={saving || pending.length > 0}
		{leading}
		{onReorder}
	/>
{/if}

{#snippet leading()}
	<AddTile
		label="Add photos or videos"
		class="aspect-square w-full rounded-xl"
		disabled={saving || adding || full}
		onclick={() => void add()}
	/>
{/snippet}
