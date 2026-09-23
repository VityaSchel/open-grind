<script lang="ts">
	import { toast } from "svelte-sonner";

	import { httpStatusOf } from "$lib/api/api-error";
	import { uploadProfilePhoto } from "$lib/api/users/profiles";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import { demoEnabled } from "$lib/demo";
	import { pickMultipleMedia } from "$lib/platform/media-picker";
	import { profileMediaUrl } from "$lib/util/media";
	import { moveItem } from "$lib/util/reorder";

	const MAX_PHOTOS = 6;
	const DAILY_LIMIT_MESSAGE =
		"You've reached today's limit for new profile photos";

	let {
		medias = $bindable(),
		disabled = false,
	}: {
		medias: { mediaHash: string; pending?: boolean }[];
		disabled?: boolean;
	} = $props();

	let uploading = $state<string[]>([]);
	let adding = $state(false);
	let mounted = true;

	$effect(() => () => {
		mounted = false;
	});

	const room = $derived(MAX_PHOTOS - medias.length - uploading.length);

	const slots = $derived([
		...medias.map((media, index) => {
			const label = `photo in slot ${index + 1}`;
			return {
				key: `${media.mediaHash}${index}`,
				src: profileMediaUrl({
					mediaHash: media.mediaHash,
					size: "thumb",
				}),
				alt: media.pending
					? `Profile ${label}, awaiting review`
					: `Profile ${label}`,
				deleteLabel: `Remove profile ${label}`,
				onDelete: () =>
					(medias = medias.filter(
						({ mediaHash }) => mediaHash !== media.mediaHash,
					)),
			};
		}),
		...uploading.map((key) => ({
			key: `uploading:${key}`,
			src: null,
			alt: "Uploading profile photo",
			pending: true,
		})),
	]);

	function uploadFailureMessage(error: unknown): string {
		if (httpStatusOf(error) === 403) return DAILY_LIMIT_MESSAGE;
		return "Couldn't upload photo";
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
				`${picked.length - accepted.length} left out, a profile holds up to ${MAX_PHOTOS} photos`,
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
				toast.error(uploadFailureMessage(error));
				if (httpStatusOf(error) === 403) {
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
	minSlots={room > 0 && !demoEnabled ? MAX_PHOTOS - 1 : MAX_PHOTOS}
	disabled={disabled || uploading.length > 0}
	leading={room > 0 && !demoEnabled ? addTile : undefined}
	onReorder={({ from, to }) =>
		(medias = moveItem({ items: medias, from, to }))}
/>

{#snippet addTile()}
	<AddTile
		label="Add photos"
		class="aspect-square w-full rounded-xl"
		disabled={disabled || adding}
		onclick={() => void add()}
	/>
{/snippet}
