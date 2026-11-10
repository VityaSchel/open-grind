<script lang="ts">
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import { attachGalleryLightbox } from "#lib/util/photoswipe/gallery-lightbox.ts";
	import { cn } from "#lib/util/utils.ts";
	import type { RightNowPostMediaData } from "#lib/model/right-now/feed.ts";

	let { media }: { media: RightNowPostMediaData } = $props();

	const frameClass = cn(
		"relative block aspect-square w-full max-w-3xs overflow-hidden rounded-xl bg-muted",
	);

	const src = $derived(proxyMediaUrl(media.thumbnailUrl));
	const fullSrc = $derived(proxyMediaUrl(media.fullImageUrl));
	const blurred = $derived(media.isNsfw && media.shouldBlur);

	const attachLightbox = (gallery: HTMLElement) =>
		attachGalleryLightbox({ gallery });
</script>

{#snippet photo()}
	<MediaImage
		{src}
		alt="Post photo"
		class="size-full rounded-xl"
		imgClass={{ "scale-110 blur-xl": blurred }}
		aspectRatio="1 / 1"
		tone="photo"
		size="md"
		loading="lazy"
		skeleton
	/>
{/snippet}

{#if blurred}
	<div data-slot="right-now-post-photo" class={frameClass}>
		{@render photo()}
		<p
			data-slot="right-now-post-photo-caption"
			class="absolute inset-x-2 bottom-2 rounded-full bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground"
		>
			May contain nudity
		</p>
	</div>
{:else}
	<div
		data-slot="right-now-post-photo"
		class="w-full max-w-3xs"
		{@attach attachLightbox}
	>
		<a
			href={fullSrc}
			rel="noreferrer"
			aria-label="Open photo"
			class={[
				frameClass,
				"item outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
			]}
		>
			{@render photo()}
		</a>
	</div>
{/if}
