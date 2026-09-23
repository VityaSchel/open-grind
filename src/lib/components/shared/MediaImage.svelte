<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		loadWhenVisible,
		TRANSPARENT_PIXEL,
	} from "$lib/util/load-when-visible";
	import {
		acquireMediaLoadSlot,
		releaseWhenSettled,
	} from "$lib/util/media-load-slots";
	import BrokenMedia from "./BrokenMedia.svelte";

	let {
		src,
		alt = "",
		class: className,
		imgClass,
		aspectRatio,
		fallbackAspectRatio = "3 / 4",
		tone = "muted",
		size = "sm",
		loading,
		pending = false,
		failedSrc = $bindable(null),
		onload,
	}: {
		src: string | null;
		alt?: string;
		class?: import("svelte/elements").ClassValue;
		imgClass?: import("svelte/elements").ClassValue;
		aspectRatio?: string;
		fallbackAspectRatio?: string;
		tone?: "muted" | "photo";
		size?: "xs" | "sm" | "md" | "lg" | "xl";
		loading?: "eager" | "lazy";
		pending?: boolean;
		failedSrc?: string | null;
		onload?: (image: HTMLImageElement) => void;
	} = $props();

	let armed = $state(false);
	const deferred = $derived(loading === "lazy" && !armed);
	const requested = $derived(
		pending || deferred || failedSrc === src ? null : src,
	);

	let slotGranted = $state(false);
	let shownSrc = $state<string | null>(null);
	let imageElement = $state<HTMLImageElement>();
	let releaseSlot = () => {};

	$effect.pre(() => {
		slotGranted = false;
		if (requested === null) return;
		const release = acquireMediaLoadSlot(() => (slotGranted = true));
		releaseSlot = release;
		return () => {
			if (imageElement?.isConnected === false && !imageElement.complete)
				releaseWhenSettled({ image: imageElement, release });
			else release();
		};
	});
</script>

{#if pending || src === null}
	<Skeleton
		data-slot={pending ? "media-image-pending" : "empty-media"}
		role={alt === "" ? undefined : "img"}
		aria-label={alt === "" ? undefined : alt}
		class={["rounded-none", { "animate-none": !pending }, className]}
	/>
{:else if failedSrc !== src}
	<img
		bind:this={imageElement}
		src={slotGranted ? src : (shownSrc ?? TRANSPARENT_PIXEL)}
		{alt}
		{loading}
		use:loadWhenVisible={deferred ? () => (armed = true) : undefined}
		draggable="false"
		class={["object-cover", className, imgClass]}
		style:aspect-ratio={aspectRatio}
		onerror={() => {
			if (!slotGranted) return;
			releaseSlot();
			failedSrc = src;
		}}
		onload={(event) => {
			const image = event.currentTarget;
			if (!(image instanceof HTMLImageElement)) return;
			if (!slotGranted || image.src === TRANSPARENT_PIXEL) return;
			releaseSlot();
			if (image.naturalWidth === 0) {
				failedSrc = src;
				return;
			}
			shownSrc = src;
			onload?.(image);
		}}
	/>
{:else}
	<BrokenMedia
		{tone}
		{size}
		class={className}
		aspectRatio={aspectRatio ?? fallbackAspectRatio}
		label={alt === "" ? undefined : alt}
	/>
{/if}
