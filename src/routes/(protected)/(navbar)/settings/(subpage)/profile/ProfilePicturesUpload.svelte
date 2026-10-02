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
	import { demoEnabled } from "$lib/demo";
	import { PROFILE_PHOTO_AWAITING_REVIEW } from "$lib/model/users/profiles";
	import { pickMultipleMedia } from "$lib/platform/media-picker";
	import { profileMediaUrl } from "$lib/util/media";
	import { moveItem } from "$lib/util/reorder";
	import { maxProfilePhotos } from "./options";

	const DAILY_LIMIT_MESSAGE =
		"You've reached today's limit for new profile photos";

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
	const canAdd = $derived(room > 0 && !demoEnabled);

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
			const label = `photo in slot ${index + 1}`;
			return {
				key: slotKey(media.mediaHash, index),
				src: profileMediaUrl({
					mediaHash: media.mediaHash,
					size: "thumb",
				}),
				alt: media.pending
					? `Profile ${label}, awaiting review`
					: `Profile ${label}`,
				deleteLabel: `Remove profile ${label}`,
				undoLabel: `Keep profile ${label}`,
				onDelete: () => toggleRemoved(media.mediaHash),
			};
		}),
		...uploading.map((key) => ({
			key: `uploading:${key}`,
			src: null,
			alt: "Uploading profile photo",
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

	async function add() {
		if (adding) return;
		adding = true;
		try {
			await pickAndUpload();
		} finally {
			adding = false;
		}
	}

	async function pickAndUpload() {
		let picked;
		try {
			picked = await pickMultipleMedia("image");
		} catch (error) {
			console.error(error);
			toast.error("Couldn't open the photo picker");
			return;
		}
		const accepted = picked.slice(0, Math.max(0, room));
		if (picked.length > accepted.length) {
			toast.error(
				`${picked.length - accepted.length} left out, a profile holds up to ${maxProfilePhotos} photos`,
			);
		}
		uploading = [...uploading, ...accepted.map(({ key }) => key)];
		for (const [index, media] of accepted.entries()) {
			if (!mounted) return;
			try {
				const uploaded = await uploadProfilePhoto(media);
				medias = [...medias, uploaded];
			} catch (error) {
				console.error(error);
				const dailyLimit = httpStatusOf(error) === 403;
				toast.error(
					dailyLimit ? DAILY_LIMIT_MESSAGE : "Couldn't upload photo",
				);
				if (dailyLimit) {
					const dropped = new Set(
						accepted.slice(index).map(({ key }) => key),
					);
					uploading = uploading.filter((key) => !dropped.has(key));
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
		label="Add photos"
		class="aspect-square w-full rounded-xl"
		disabled={disabled || adding}
		onclick={() => (sheetOpen = true)}
	/>
{/snippet}

<PreviousUploadsSheet
	bind:open={sheetOpen}
	uploadLabel="Upload photos"
	submitLabel="Add to profile"
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
