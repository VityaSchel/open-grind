<script lang="ts">
	import {
		deleteDrawerMedia,
		type DrawerMedia,
		getAllDrawerMedia,
	} from "$lib/api/messaging/drawer";
	import { albumRoom, isVideoContent } from "$lib/components/album/album";
	import PreviousUploadsSheet from "$lib/components/media-sheet/PreviousUploadsSheet.svelte";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import { type MessageKeyWith, type PlainMessageKey, t } from "$lib/i18n";
	import { formatInteger } from "$lib/i18n/format";
	import { proxyMediaUrl } from "$lib/util/media";
	import type { AlbumContent } from "$lib/model/messaging/albums";
	import {
		addAlbumMedia,
		addPreviousUploads,
	} from "../album-uploads/add-album-media";
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

	const uploadingKeys = {
		photo: "media.albums.editor.content.a11y.uploadingPhoto",
		video: "media.albums.editor.content.a11y.uploadingVideo",
	} as const satisfies Record<PendingUpload["kind"], PlainMessageKey>;

	const slotKeys = {
		photo: {
			ready: "media.albums.editor.content.a11y.photoSlot",
			processing: "media.albums.editor.content.a11y.photoSlotProcessing",
			remove: "media.albums.editor.content.a11y.removePhotoSlot",
			keep: "media.albums.editor.content.a11y.keepPhotoSlot",
		},
		video: {
			ready: "media.albums.editor.content.a11y.videoSlot",
			processing: "media.albums.editor.content.a11y.videoSlotProcessing",
			remove: "media.albums.editor.content.a11y.removeVideoSlot",
			keep: "media.albums.editor.content.a11y.keepVideoSlot",
		},
	} as const satisfies Record<
		PendingUpload["kind"],
		Record<
			"ready" | "processing" | "remove" | "keep",
			MessageKeyWith<{ slot: string }>
		>
	>;

	let adding = $state(false);
	let sheetOpen = $state(false);

	const removedKeys = $derived(
		new Set(removed.map((contentId) => String(contentId))),
	);

	const pendingSlots = $derived(
		pending.map(({ key, kind }) => ({
			key: `pending:${key}`,
			src: null,
			alt: t(uploadingKeys[kind]),
			video: kind === "video",
			pending: true,
		})),
	);

	const contentSlots = $derived(
		content.map((item, index) => {
			const video = isVideoContent(item.contentType);
			const keys = slotKeys[video ? "video" : "photo"];
			const slot = formatInteger(index + 1);
			return {
				key: String(item.contentId),
				src: proxyMediaUrl(item.thumbUrl),
				alt: t(item.processing ? keys.processing : keys.ready, {
					slot,
				}),
				deleteLabel: t(keys.remove, { slot }),
				undoLabel: t(keys.keep, { slot }),
				video,
				pending: item.processing,
				onDelete: () => onToggleRemoved(item.contentId),
			};
		}),
	);

	const slots = $derived([...pendingSlots, ...contentSlots]);

	const room = $derived(
		limits === null ? null : albumRoom({ content, pending, limits }),
	);

	const full = $derived(room !== null && !room.photos && !room.videos);

	const itemRoom = $derived(
		limits === null
			? null
			: limits.maxContentItemsPerAlbum - content.length - pending.length,
	);

	async function loadDrawerPhotos(): Promise<DrawerMedia[]> {
		const drawer = await getAllDrawerMedia();
		return drawer.filter((item) => !isVideoContent(item.contentType));
	}

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
		title={t("media.albums.editor.content.empty.title")}
		description={t("media.albums.editor.content.empty.description")}
		disabled={saving || adding || full}
		onAdd={() => (sheetOpen = true)}
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
		label={t("media.albums.editor.content.addMedia")}
		class="aspect-square w-full rounded-xl"
		disabled={saving || adding || full}
		onclick={() => (sheetOpen = true)}
	/>
{/snippet}

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel={t("common.media.uploadPhotosOrVideos")}
	submitLabel={t("media.albums.editor.content.addToAlbum")}
	max={itemRoom}
	load={loadDrawerPhotos}
	describe={(item) => ({
		key: item.id,
		src: proxyMediaUrl(item.url),
		video: false,
	})}
	onUpload={() => void add()}
	onDelete={(item) => deleteDrawerMedia(item.id)}
	onSubmit={(chosen) =>
		addPreviousUploads({
			uploads,
			albumId,
			mediaIds: chosen.map(({ id }) => id),
			present: content.map(({ contentId }) => contentId),
		})}
/>
