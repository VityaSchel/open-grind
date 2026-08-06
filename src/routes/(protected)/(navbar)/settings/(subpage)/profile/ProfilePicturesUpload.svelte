<script lang="ts">
	import ProfilePictureSlot from "./ProfilePictureSlot.svelte";

	const MAX_PHOTOS = 6;

	let { medias = $bindable() }: { medias: { mediaHash: string }[] } =
		$props();

	const emptySlots = $derived(Math.max(0, MAX_PHOTOS - medias.length));

	function removePhoto(mediaHash: string) {
		medias = medias.filter((media) => media.mediaHash !== mediaHash);
	}
</script>

<div class="grid grid-cols-3 gap-2">
	{#each medias as media, i (media.mediaHash + i)}
		<ProfilePictureSlot
			mediaHash={media.mediaHash}
			position={i + 1}
			onDelete={() => removePhoto(media.mediaHash)}
		/>
	{/each}
	{#each Array.from({ length: emptySlots })}
		<div
			class="aspect-square rounded-xl border border-dashed border-border"
			aria-hidden="true"
		></div>
	{/each}
</div>
