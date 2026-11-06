<script lang="ts">
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import { openLightbox } from "#lib/util/photoswipe/index.ts";
	import { cn } from "#lib/util/utils.ts";
	import type { RightNowPostMediaItem } from "#lib/model/right-now/feed.ts";

	let { media }: { media: RightNowPostMediaItem } = $props();

	const frameClass = cn(
		"relative block aspect-square w-full max-w-3xs overflow-hidden rounded-xl bg-muted",
	);

	const src = $derived(proxyMediaUrl(media.data.thumbnailUrl));
	const fullSrc = $derived(proxyMediaUrl(media.data.fullImageUrl));
	const blurred = $derived(media.data.isNsfw && media.data.shouldBlur);

	let open = $state(false);

	$effect(() => {
		if (!open) return;
		const controller = new AbortController();
		openLightbox({
			items: [{ src: fullSrc }],
			signal: controller.signal,
			onClosed: () => {
				open = false;
			},
		}).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			console.error(error);
			showErrorToast({ label: "Failed to open photo", error });
			open = false;
		});
		return () => controller.abort();
	});
</script>

{#snippet photo()}
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
	<button
		type="button"
		data-slot="right-now-post-photo"
		aria-label="Open photo"
		class={[
			frameClass,
			"cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
		]}
		onclick={() => (open = true)}
	>
		{@render photo()}
	</button>
{/if}
