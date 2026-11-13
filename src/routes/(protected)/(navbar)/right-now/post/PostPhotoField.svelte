<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		RightNowPhotoTooSmallError,
		uploadRightNowPhotoFromUrl,
		uploadRightNowPickedPhoto,
	} from "#lib/api/right-now/photo.ts";
	import { drawerPhotoUploads } from "#lib/components/media-sheet/drawer-photos.ts";
	import PreviousUploadsSheet from "#lib/components/media-sheet/PreviousUploadsSheet.svelte";
	import AddTile from "#lib/components/shared/AddTile.svelte";
	import MediaSlot from "#lib/components/shared/MediaSlot.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PickedMedia, pickMedia } from "#lib/platform/media-picker.ts";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import type { DrawerMedia } from "#lib/api/messaging/drawer.ts";
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
	let removedPhoto = $state.raw<PostPhoto | null>(null);
	let mounted = true;

	$effect(() => () => {
		mounted = false;
	});

	const shown = $derived(photo ?? removedPhoto);
	const removed = $derived(photo === null && removedPhoto !== null);
	const src = $derived(proxyMediaUrl(shown?.thumbnailUrl));

	function toggleRemoved() {
		if (removed) {
			photo = removedPhoto;
			removedPhoto = null;
		} else {
			removedPhoto = photo;
			photo = null;
		}
	}

	async function upload({
		send,
	}: {
		send: () => Promise<RightNowMediaUploadResponse>;
	}) {
		uploading = true;
		try {
			const { mediaId, thumbnailUrl } = await send();
			if (!mounted) return;
			photo = { mediaId, thumbnailUrl };
			removedPhoto = null;
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
	<fieldset {disabled} class="flex gap-2">
		{#if shown !== null}
			<div data-slot="post-photo" class="w-28">
				<MediaSlot
					{src}
					alt={rejected ? "Post photo, rejected" : "Post photo"}
					{removed}
					deleteLabel="Remove photo"
					undoLabel="Keep photo"
					onDelete={toggleRemoved}
				/>
			</div>
		{/if}
		{#if uploading}
			<div
				data-slot="post-photo-uploading"
				role="status"
				class="flex aspect-square w-28 flex-col items-center justify-center gap-1 rounded-xl bg-muted text-xs text-muted-foreground"
			>
				<Spinner aria-hidden="true" />
				Uploading photo
			</div>
		{:else if shown === null || removed}
			<AddTile
				label="Add photo"
				class="aspect-square w-28 rounded-xl"
				{disabled}
				onclick={() => (sheetOpen = true)}
			/>
		{/if}
	</fieldset>
</div>

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel="Upload a photo"
	submitLabel="Add to post"
	max={1}
	{...drawerPhotoUploads}
	onUpload={() => void addFromDevice()}
	onSubmit={addFromUploads}
/>
