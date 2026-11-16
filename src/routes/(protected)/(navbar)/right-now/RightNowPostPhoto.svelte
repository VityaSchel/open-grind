<script lang="ts">
	import { matureContentCovered } from "#lib/components/mature-content/mature-content.ts";
	import MatureContentCover from "#lib/components/mature-content/MatureContentCover.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import { preloadFullImage } from "#lib/util/photoswipe/full-size.ts";
	import { attachGalleryLightbox } from "#lib/util/photoswipe/gallery-lightbox.ts";
	import { cn } from "#lib/util/utils.ts";
	import type { RightNowPostMediaItem } from "#lib/model/right-now/feed.ts";

	let { media, own }: { media: RightNowPostMediaItem; own: boolean } =
		$props();

	const frameClass = cn(
		"relative block aspect-square w-full max-w-3xs overflow-hidden rounded-xl bg-muted",
	);

	const src = $derived(proxyMediaUrl(media.data.thumbnailUrl));
	const fullSrc = $derived(proxyMediaUrl(media.data.fullImageUrl));
	const blurred = $derived(media.data.isNsfw && media.data.shouldBlur);
	const covered = $derived(!own && matureContentCovered());

	const attachLightbox = (gallery: HTMLElement) =>
		attachGalleryLightbox({ gallery, croppedThumbs: true });
</script>

{#snippet photo()}
	<MediaImage
		{src}
		alt={t("browse.rightNow.photo.alt")}
		class="size-full rounded-xl"
		imgClass={{ "scale-110 blur-xl": blurred }}
		aspectRatio="1 / 1"
		tone="photo"
		size="md"
		loading="lazy"
		skeleton
		onload={blurred ? undefined : () => void preloadFullImage(fullSrc)}
	/>
{/snippet}

{#if covered}
	<div data-slot="right-now-post-photo" class={frameClass}>
		{@render photo()}
		<MatureContentCover class="rounded-xl" />
	</div>
{:else if blurred}
	<div data-slot="right-now-post-photo" class={frameClass}>
		{@render photo()}
		<p
			data-slot="right-now-post-photo-caption"
			class="absolute inset-x-2 bottom-2 rounded-full bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground"
		>
			{t("browse.rightNow.photo.mayContainNudity")}
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
			aria-label={t("browse.rightNow.photo.a11y.open")}
			class={[frameClass, "item"]}
		>
			{@render photo()}
		</a>
	</div>
{/if}
