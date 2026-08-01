<script lang="ts">
	// import { PlusIcon } from "phosphor-svelte";

	import ProfilePictureSlot from "./ProfilePictureSlot.svelte";

	const MAX_PHOTOS = 6;

	let {
		medias = $bindable(),
	}: {
		medias: { mediaHash: string }[];
	} = $props();

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
			class="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground/60"
			aria-hidden="true"
		>
			<!-- <PlusIcon class="size-6" /> -->
		</div>
	{/each}
</div>
