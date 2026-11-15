<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		RightNowPhotoTooSmallError,
		uploadRightNowPhotoFromUrl,
		uploadRightNowPickedPhoto,
	} from "#lib/api/right-now/photo.ts";
	import Field from "#lib/components/fields/Field.svelte";
	import { drawerPhotoUploads } from "#lib/components/media-sheet/drawer-photos.ts";
	import PreviousUploadsSheet from "#lib/components/media-sheet/PreviousUploadsSheet.svelte";
	import AddTile from "#lib/components/shared/AddTile.svelte";
	import MediaSlot from "#lib/components/shared/MediaSlot.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { type PickedMedia, pickMedia } from "#lib/platform/media-picker.ts";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import type { DrawerMedia } from "#lib/api/messaging/drawer.ts";
	import type { RightNowMediaUploadResponse } from "#lib/model/right-now/post.ts";
	import type { PostPhoto } from "./post-form";

	let {
		photo = $bindable(),
		uploading = $bindable(false),
		disabled = false,
		rejectedMediaIds = [],
	}: {
		photo: PostPhoto | null;
		uploading?: boolean;
		disabled?: boolean;
		rejectedMediaIds?: number[];
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
				toast.error(t("browse.rightNow.sheet.photo.errors.tooSmall"));
			} else {
				showErrorToast({
					label: t("browse.rightNow.sheet.photo.errors.uploadFailed"),
					error,
				});
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
			toast.error(t("browse.rightNow.sheet.photo.errors.pickerFailed"));
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

<Field label={t("browse.rightNow.sheet.photo.label")}>
	{#snippet picker({ labelId })}
		<fieldset {disabled} aria-labelledby={labelId} class="flex gap-2">
			{#if shown !== null}
				<div data-slot="post-photo" class="w-28">
					<MediaSlot
						{src}
						alt={rejectedMediaIds.includes(shown.mediaId)
							? t("browse.rightNow.sheet.photo.altRejected")
							: t("browse.rightNow.photo.alt")}
						{removed}
						deleteLabel={t("browse.rightNow.sheet.photo.remove")}
						undoLabel={t("browse.rightNow.sheet.photo.keep")}
						onDelete={toggleRemoved}
					/>
				</div>
			{/if}
			{#if uploading}
				<div
					data-slot="post-photo-uploading"
					role="status"
					class="w-28"
				>
					<MediaSlot
						src={null}
						alt={t("browse.rightNow.sheet.photo.uploading")}
						pending
					/>
				</div>
			{:else if shown === null || removed}
				<AddTile
					label={t("browse.rightNow.sheet.photo.add")}
					class="aspect-square w-28 rounded-xl"
					onclick={() => (sheetOpen = true)}
				/>
			{/if}
		</fieldset>
	{/snippet}
</Field>

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel={t("browse.rightNow.sheet.photo.upload")}
	submitLabel={t("browse.rightNow.sheet.photo.addToPost")}
	max={1}
	{...drawerPhotoUploads}
	onUpload={() => void addFromDevice()}
	onSubmit={addFromUploads}
/>
