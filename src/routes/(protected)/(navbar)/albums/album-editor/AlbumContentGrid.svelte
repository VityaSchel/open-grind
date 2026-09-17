<script lang="ts">
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { isVideoContent } from "$lib/components/album/album";
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { AlbumContent } from "$lib/model/messaging/albums";
	import { addAlbumMedia } from "../album-uploads/add-album-media";
	import type { PendingUpload } from "../album-uploads/album-uploads.svelte";

	let {
		albumId,
		content,
		pending,
		removed,
		saving,
		maxPhotos,
		onToggleRemoved,
		onReorder,
	}: {
		albumId: number;
		content: AlbumContent[];
		pending: PendingUpload[];
		removed: number[];
		saving: boolean;
		maxPhotos: number | null;
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

	const photos = $derived(
		content.filter((item) => !isVideoContent(item.contentType)).length +
			pending.filter(({ kind }) => kind === "photo").length,
	);

	const full = $derived(maxPhotos !== null && photos >= maxPhotos);

	async function add() {
		adding = true;
		try {
			await addAlbumMedia({ albumId, content: () => content });
		} finally {
			adding = false;
		}
	}
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
		<Empty.Content>
			<Button
				disabled={saving || adding || full}
				onclick={() => void add()}
			>
				<PlusIcon weight="bold" />
				Add photos or videos
			</Button>
		</Empty.Content>
	</Empty.Root>
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
	<button
		type="button"
		data-slot="add-media-tile"
		class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-card-foreground/5 px-2 text-center text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
		disabled={saving || adding || full}
		onclick={() => void add()}
	>
		<PlusIcon weight="bold" class="size-6" />
		<span class="text-xs font-medium text-balance"
			>Add photos or videos</span
		>
	</button>
{/snippet}
