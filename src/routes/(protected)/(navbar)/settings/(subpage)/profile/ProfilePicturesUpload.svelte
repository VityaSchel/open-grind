<script lang="ts">
	import { toast } from "svelte-sonner";

	import { httpStatusOf } from "$lib/api/api-error";
	import {
		deleteProfilePhotos,
		getProfileUploadedPhotos,
		uploadProfilePhoto,
	} from "$lib/api/users/profiles";
	import PreviousUploadsSheet from "$lib/components/media-sheet/PreviousUploadsSheet.svelte";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import { demoEnabled, screenshotsEnabled } from "$lib/demo";
	import { t } from "$lib/i18n";
	import { formatInteger } from "$lib/i18n/format";
	import { PROFILE_PHOTO_AWAITING_REVIEW } from "$lib/model/users/profiles";
	import { discardStagedMedia } from "$lib/platform/media-file";
	import {
		receiveMedia,
		screenMedia,
	} from "$lib/platform/media-intake.svelte";
	import {
		type PickedMedia,
		pickMultipleMedia,
	} from "$lib/platform/media-picker";
	import { profileMediaUrl } from "$lib/util/media";
	import { moveItem } from "$lib/util/reorder";
	import { maxProfilePhotos } from "./options";

	type PreviousUpload = { mediaHash: string; state: number };

	let {
		medias = $bindable(),
		removed = $bindable([]),
		ourProfileId,
		disabled = false,
	}: {
		medias: { mediaHash: string; pending?: boolean }[];
		removed?: string[];
		ourProfileId: number;
		disabled?: boolean;
	} = $props();

	let uploading = $state<string[]>([]);
	let adding = $state(false);
	let sheetOpen = $state(false);
	let mounted = true;

	$effect(() => () => {
		mounted = false;
	});

	const room = $derived(maxProfilePhotos - medias.length - uploading.length);
	const canAdd = $derived(room > 0 && (!demoEnabled || screenshotsEnabled));

	function slotKey(mediaHash: string, index: number): string {
		return `${mediaHash}${index}`;
	}

	const removedKeys = $derived(
		new Set(
			medias.flatMap(({ mediaHash }, index) =>
				removed.includes(mediaHash) ? [slotKey(mediaHash, index)] : [],
			),
		),
	);

	function toggleRemoved(mediaHash: string) {
		removed = removed.includes(mediaHash)
			? removed.filter((hash) => hash !== mediaHash)
			: [...removed, mediaHash];
	}

	const slots = $derived([
		...medias.map((media, index) => {
			const slot = formatInteger(index + 1);
			return {
				key: slotKey(media.mediaHash, index),
				src: profileMediaUrl({
					mediaHash: media.mediaHash,
					size: "thumb",
				}),
				alt: t(
					media.pending
						? "settings.profile.photos.a11y.slotAwaitingReview"
						: "settings.profile.photos.a11y.slot",
					{ slot },
				),
				deleteLabel: t("settings.profile.photos.a11y.removeSlot", {
					slot,
				}),
				undoLabel: t("settings.profile.photos.a11y.keepSlot", { slot }),
				onDelete: () => toggleRemoved(media.mediaHash),
			};
		}),
		...uploading.map((key) => ({
			key: `uploading:${key}`,
			src: null,
			alt: t("settings.profile.photos.a11y.uploading"),
			pending: true,
		})),
	]);

	async function loadPreviousUploads(): Promise<PreviousUpload[]> {
		const { medias: uploaded } = await getProfileUploadedPhotos({
			selected: false,
		});
		const shown = new Set(medias.map(({ mediaHash }) => mediaHash));
		return uploaded.filter(({ mediaHash }) => !shown.has(mediaHash));
	}

	function addFromUploads(chosen: PreviousUpload[]): boolean {
		medias = [
			...medias,
			...chosen.map(({ mediaHash, state }) => ({
				mediaHash,
				pending: state === PROFILE_PHOTO_AWAITING_REVIEW,
			})),
		];
		return true;
	}

	async function add(received?: PickedMedia[]) {
		if (adding) return;
		adding = true;
		try {
			const photos =
				received === undefined
					? await pickPhotos()
					: (
							await screenMedia({
								media: received,
								videos: false,
							})
						).map(({ media }) => media);
			await upload(photos);
		} finally {
			adding = false;
		}
	}

	receiveMedia(() =>
		canAdd && !disabled && !adding
			? {
					label: t("settings.profile.photos.dropToAdd"),
					videos: false,
					receive: (media) => void add(media),
				}
			: null,
	);

	async function pickPhotos(): Promise<PickedMedia[]> {
		try {
			return await pickMultipleMedia("image");
		} catch (error) {
			console.error(error);
			toast.error(t("settings.profile.photos.errors.openPickerFailed"));
			return [];
		}
	}

	async function upload(picked: PickedMedia[]) {
		const accepted = picked.slice(0, Math.max(0, room));
		if (picked.length > accepted.length) {
			toast.error(
				t("settings.profile.photos.errors.leftOut", {
					count: picked.length - accepted.length,
					max: formatInteger(maxProfilePhotos),
				}),
			);
			void discardStagedMedia(picked.slice(accepted.length));
		}
		uploading = [...uploading, ...accepted.map(({ key }) => key)];
		for (const [index, media] of accepted.entries()) {
			if (!mounted) {
				void discardStagedMedia(accepted.slice(index));
				return;
			}
			try {
				const uploaded = await uploadProfilePhoto(media);
				medias = [...medias, uploaded];
			} catch (error) {
				console.error(error);
				const dailyLimit = httpStatusOf(error) === 403;
				toast.error(
					t(
						dailyLimit
							? "settings.profile.photos.errors.dailyLimit"
							: "settings.profile.photos.errors.uploadFailed",
					),
				);
				if (dailyLimit) {
					const dropped = new Set(
						accepted.slice(index).map(({ key }) => key),
					);
					uploading = uploading.filter((key) => !dropped.has(key));
					void discardStagedMedia(accepted.slice(index + 1));
					return;
				}
			} finally {
				uploading = uploading.filter((key) => key !== media.key);
			}
		}
	}
</script>

<MediaSlotGrid
	{slots}
	removed={removedKeys}
	minSlots={canAdd ? maxProfilePhotos - 1 : maxProfilePhotos}
	disabled={disabled || uploading.length > 0}
	leading={canAdd ? addTile : undefined}
	onReorder={({ from, to }) =>
		(medias = moveItem({ items: medias, from, to }))}
/>

{#snippet addTile()}
	<AddTile
		label={t("settings.profile.photos.add")}
		class="aspect-square w-full rounded-xl"
		disabled={disabled || adding}
		onclick={() => (sheetOpen = true)}
	/>
{/snippet}

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel={t("settings.profile.photos.upload")}
	submitLabel={t("settings.profile.photos.submit")}
	max={room}
	load={loadPreviousUploads}
	describe={({ mediaHash }) => ({
		key: mediaHash,
		src: profileMediaUrl({ mediaHash, size: "thumb" }),
		video: false,
	})}
	onUpload={() => void add()}
	onDelete={({ mediaHash }) =>
		deleteProfilePhotos({
			cacheProfileId: ourProfileId,
			mediaHashes: [mediaHash],
		})}
	onSubmit={addFromUploads}
/>
