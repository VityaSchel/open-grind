<script lang="ts" module>
	import type { Attachment } from "svelte/attachments";

	function firstFrameOf(file: File): Attachment<HTMLVideoElement> {
		return (video) => {
			const url = URL.createObjectURL(file);
			video.src = `${url}#t=0.001`;
			return () => {
				video.removeAttribute("src");
				video.load();
				URL.revokeObjectURL(url);
			};
		};
	}
</script>

<script lang="ts">
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import VideoCameraIcon from "phosphor-svelte/lib/VideoCameraIcon";

	import { Skeleton } from "$lib/components/ui/skeleton";
	import { localFileOf } from "$lib/platform/media-file";
	import { formatMediaDuration } from "$lib/util/format-time";
	import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
	import type { OfferedMedia } from "./send-media-offer.svelte";

	let { item, single }: { item: OfferedMedia; single: boolean } = $props();

	const video = $derived(item.inspection.kind === "video");
	const shape = $derived.by(() => {
		const { width, height } = item.inspection;
		if (width !== undefined && height !== undefined)
			return { width, height };
		return video ? { width: 16, height: 9 } : { width: 1, height: 1 };
	});
	const file = $derived(video ? localFileOf(item.media) : null);
	const duration = $derived(
		item.inspection.durationMs === undefined
			? null
			: formatMediaDuration(item.inspection.durationMs / 1000),
	);

	let frameFailed = $state(false);
</script>

<div
	data-slot="send-media-preview"
	class={[
		"relative overflow-hidden rounded-[calc(var(--radius-4xl)_-_--spacing(6))] bg-muted text-muted-foreground",
		{ "mx-auto": single, "aspect-square w-full": !single },
	]}
	style:width={single
		? `min(100cqw, calc(60dvh * ${shape.width} / ${shape.height}))`
		: undefined}
	style:aspect-ratio={single ? `${shape.width} / ${shape.height}` : undefined}
>
	{#if video}
		{#if file !== null && !frameFailed}
			<video
				{@attach firstFrameOf(file)}
				class="size-full object-cover"
				poster={TRANSPARENT_PIXEL}
				preload="metadata"
				muted
				playsinline
				onerror={() => (frameFailed = true)}
			></video>
		{:else}
			<div class="flex size-full items-center justify-center">
				<VideoCameraIcon class="size-8" />
			</div>
		{/if}
		{#if duration !== null}
			<span
				class="absolute start-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums"
			>
				{duration}
			</span>
		{/if}
	{:else if item.preview !== null}
		<img
			src={item.preview.dataUrl}
			alt="To send"
			class={[
				"size-full",
				{ "object-contain": single, "object-cover": !single },
			]}
		/>
	{:else if item.previewing}
		<Skeleton class="size-full rounded-none" />
	{:else}
		<div class="flex size-full items-center justify-center">
			<ImageIcon class="size-8" />
		</div>
	{/if}
</div>
