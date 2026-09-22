<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		loadWhenVisible,
		TRANSPARENT_PIXEL,
	} from "$lib/util/load-when-visible";
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
		src={deferred ? TRANSPARENT_PIXEL : src}
		{alt}
		{loading}
		use:loadWhenVisible={deferred ? () => (armed = true) : undefined}
		draggable="false"
		class={["object-cover", className, imgClass]}
		style:aspect-ratio={aspectRatio}
		onerror={() => (failedSrc = src)}
		onload={(event) => {
			const image = event.currentTarget;
			if (!(image instanceof HTMLImageElement)) return;
			if (image.src === TRANSPARENT_PIXEL) return;
			if (image.naturalWidth === 0) failedSrc = src;
			else onload?.(image);
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
