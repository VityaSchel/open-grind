<script lang="ts">
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import type { RightNowPostMediaItem } from "#lib/model/right-now/feed.ts";

	let { media }: { media: RightNowPostMediaItem } = $props();

	const src = $derived(proxyMediaUrl(media.data.thumbnailUrl));
	const blurred = $derived(media.data.isNsfw && media.data.shouldBlur);
</script>

<div
	data-slot="right-now-post-photo"
	class="relative aspect-square w-full max-w-3xs overflow-hidden rounded-xl bg-muted"
>
	<MediaImage
		{src}
		alt="Post photo"
		class="size-full"
		imgClass={{ "scale-110 blur-xl": blurred }}
		aspectRatio="1 / 1"
		tone="photo"
		size="md"
		loading="lazy"
		skeleton
	/>
	{#if blurred}
		<p
			data-slot="right-now-post-photo-caption"
			class="absolute inset-x-2 bottom-2 rounded-full bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground"
		>
			May contain nudity
		</p>
	{/if}
</div>
