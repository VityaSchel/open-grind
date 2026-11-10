<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import { attachGalleryLightbox } from "#lib/util/photoswipe/gallery-lightbox.ts";
	import { cn } from "#lib/util/utils.ts";
	import type { RightNowPostMediaData } from "#lib/model/right-now/feed.ts";

	let {
		media,
		blurred,
		size = "md",
	}: {
		media: RightNowPostMediaData;
		blurred: boolean;
		size?: "md" | "sm";
	} = $props();

	const sizeClass = $derived(
		size === "sm" ? "size-20 shrink-0" : "w-full max-w-3xs",
	);
	const radiusClass = $derived(size === "sm" ? "rounded-lg" : "rounded-xl");
	const frameClass = $derived(
		cn(
			"relative block aspect-square w-full overflow-hidden bg-muted",
			radiusClass,
		),
	);

	const src = $derived(proxyMediaUrl(media.thumbnailUrl));
	const fullSrc = $derived(proxyMediaUrl(media.fullImageUrl));

	const attachLightbox = (gallery: HTMLElement) =>
		attachGalleryLightbox({ gallery });
</script>

{#snippet photo()}
	<MediaImage
		{src}
		alt="Post photo"
		class={["size-full", radiusClass]}
		imgClass={{ "scale-110 blur-xl": blurred }}
		aspectRatio="1 / 1"
		tone="photo"
		size="md"
		loading="lazy"
		skeleton
	/>
{/snippet}

{#if blurred}
	<div data-slot="right-now-post-photo" class={cn(frameClass, sizeClass)}>
		{@render photo()}
		{#if size === "sm"}
			<p
				data-slot="right-now-post-photo-caption"
				class="absolute inset-0 grid place-items-center text-muted-foreground"
				title="May contain nudity"
			>
				<EyeSlashIcon weight="fill" class="size-5" />
				<span class="sr-only">May contain nudity</span>
			</p>
		{:else}
			<p
				data-slot="right-now-post-photo-caption"
				class="absolute inset-x-2 bottom-2 rounded-full bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground"
			>
				May contain nudity
			</p>
		{/if}
	</div>
{:else}
	<div
		data-slot="right-now-post-photo"
		class={sizeClass}
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
