<script lang="ts">
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		deleteDrawerMedia,
		type DrawerMedia,
		getAllDrawerMedia,
	} from "#lib/api/messaging/drawer.ts";
	import {
		RightNowPhotoTooSmallError,
		uploadRightNowPhotoFromUrl,
		uploadRightNowPickedPhoto,
	} from "#lib/api/right-now/photo.ts";
	import { isVideoContent } from "#lib/components/album/album.ts";
	import PreviousUploadsSheet from "#lib/components/media-sheet/PreviousUploadsSheet.svelte";
	import AddTile from "#lib/components/shared/AddTile.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { type PickedMedia, pickMedia } from "#lib/platform/media-picker.ts";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import type { RightNowMediaUploadResponse } from "#lib/model/right-now/post.ts";
	import type { PostPhoto } from "./post-form";

	let {
		photo = $bindable(),
		uploading = $bindable(false),
		disabled = false,
		rejected = false,
	}: {
		photo: PostPhoto | null;
		uploading?: boolean;
		disabled?: boolean;
		rejected?: boolean;
	} = $props();

	let sheetOpen = $state(false);
	let confirmingRemoval = $state(false);
	let mounted = true;

	$effect(() => () => {
		mounted = false;
	});

	const src = $derived(proxyMediaUrl(photo?.thumbnailUrl));

	dismissOnBackGesture({
		active: () => confirmingRemoval,
		dismiss: () => {
			confirmingRemoval = false;
		},
	});

	async function loadDrawerPhotos(): Promise<DrawerMedia[]> {
		const drawer = await getAllDrawerMedia();
		return drawer.filter((item) => !isVideoContent(item.contentType));
	}

	async function upload({
		send,
	}: {
		send: () => Promise<RightNowMediaUploadResponse>;
	}) {
		uploading = true;
		try {
			const { mediaId, thumbnailUrl } = await send();
			if (mounted) photo = { mediaId, thumbnailUrl };
		} catch (error) {
			console.error(error);
			if (error instanceof RightNowPhotoTooSmallError) {
				toast.error(error.message);
			} else {
				showErrorToast({ label: "Couldn't upload photo", error });
			}
		} finally {
			uploading = false;
		}
	}

	async function pickPhoto(): Promise<PickedMedia | null> {
		try {
			return await pickMedia("image");
		} catch (error) {
			console.error(error);
			toast.error("Couldn't open the photo picker");
			return null;
		}
	}

	async function addFromDevice() {
		const media = await pickPhoto();
		if (media === null) return;
		await upload({ send: () => uploadRightNowPickedPhoto({ media }) });
	}

	function addFromUploads([chosen]: DrawerMedia[]): boolean {
		if (chosen === undefined) return false;
		void upload({
			send: () => uploadRightNowPhotoFromUrl({ url: chosen.url }),
		});
		return true;
	}
</script>

<div data-slot="post-photo-field" class="flex flex-col gap-1.5">
	<p class="px-1 text-sm font-medium">Photo</p>
	{#if uploading}
		<div
			data-slot="post-photo-uploading"
			role="status"
			class="flex aspect-square w-28 flex-col items-center justify-center gap-1 rounded-xl bg-muted text-xs text-muted-foreground"
		>
			<Spinner aria-hidden="true" />
			Uploading photo
		</div>
	{:else if photo !== null}
		<div
			data-slot="post-photo"
			class="relative aspect-square w-28 overflow-hidden rounded-xl bg-muted"
		>
			<MediaImage
				{src}
				alt={rejected ? "Post photo, rejected" : "Post photo"}
				class="size-full"
				aspectRatio="1 / 1"
				fallbackAspectRatio="1 / 1"
				tone="photo"
				size="sm"
				skeleton
			/>
			<Button
				variant="secondary"
				size="icon-xs"
				class="absolute end-1.5 top-1.5 shadow-sm"
				aria-label="Remove photo"
				{disabled}
				onclick={() => (confirmingRemoval = true)}
			>
				<XIcon weight="bold" />
			</Button>
		</div>
	{:else}
		<AddTile
			label="Add photo"
			class="aspect-square w-28 rounded-xl"
			{disabled}
			onclick={() => (sheetOpen = true)}
		/>
	{/if}
</div>

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel="Upload a photo"
	submitLabel="Add to post"
	max={1}
	load={loadDrawerPhotos}
	describe={(item) => ({
		key: item.id,
		src: proxyMediaUrl(item.url),
		video: false,
	})}
	onUpload={() => void addFromDevice()}
	onDelete={(item) => deleteDrawerMedia(item.id)}
	onSubmit={addFromUploads}
/>

<AlertDialog.Root bind:open={confirmingRemoval}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove photo?</AlertDialog.Title>
			<AlertDialog.Description>
				This photo will be removed from your post.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					confirmingRemoval = false;
					photo = null;
				}}
			>
				Remove
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
