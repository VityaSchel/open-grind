<script lang="ts">
	import MediaSlotGrid from "$lib/components/shared/MediaSlotGrid.svelte";
	import { profileMediaUrl } from "$lib/util/media";
	import { moveItem } from "$lib/util/reorder";

	const MAX_PHOTOS = 6;

	let { medias = $bindable() }: { medias: { mediaHash: string }[] } =
		$props();

	const slots = $derived(
		medias.map((media, index) => {
			const label = `photo in slot ${index + 1}`;
			return {
				key: `${media.mediaHash}${index}`,
				src: profileMediaUrl({
					mediaHash: media.mediaHash,
					size: "thumb",
				}),
				alt: `Profile ${label}`,
				deleteLabel: `Remove profile ${label}`,
				onDelete: () =>
					(medias = medias.filter(
						({ mediaHash }) => mediaHash !== media.mediaHash,
					)),
			};
		}),
	);
</script>

<MediaSlotGrid
	{slots}
	minSlots={MAX_PHOTOS}
	onReorder={({ from, to }) =>
		(medias = moveItem({ items: medias, from, to }))}
/>
