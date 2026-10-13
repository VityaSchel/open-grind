<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionOverlay from "$lib/components/shared/SelectionOverlay.svelte";
	import type { GaymojiItem } from "$lib/api/messaging/gaymoji";

	let {
		gaymoji,
		selected,
		onclick,
	}: { gaymoji: GaymojiItem; selected: boolean; onclick: () => void } =
		$props();
</script>

<button
	type="button"
	data-slot="sticker-tile"
	class="relative aspect-square cursor-pointer rounded-lg"
	aria-label={gaymoji.label}
	aria-pressed={selected}
	{onclick}
>
	<MediaImage
		src={gaymoji.imageUrl}
		alt={gaymoji.label}
		loading="lazy"
		fit="contain"
		skeleton
		class="block size-full rounded-lg"
	/>
	{#if selected}
		<SelectionOverlay />
	{/if}
</button>
