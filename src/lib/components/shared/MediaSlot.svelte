<script lang="ts">
	import {
		ArrowCounterClockwiseIcon,
		TrashIcon,
		VideoIcon,
	} from "phosphor-svelte";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		src,
		alt,
		deleteLabel,
		undoLabel,
		removed = false,
		video = false,
		pending = false,
		held = false,
		onDelete,
	}: {
		src: string | null;
		alt: string;
		deleteLabel?: string;
		undoLabel?: string;
		removed?: boolean;
		video?: boolean;
		pending?: boolean;
		held?: boolean;
		onDelete?: () => void;
	} = $props();
</script>

<div
	data-slot="media-slot"
	class={[
		"relative aspect-square overflow-hidden rounded-xl transition-[box-shadow,scale]",
		{
			"bg-muted": !pending,
			"scale-105 shadow-xl ring-2 ring-ring": held,
			"ring-2 ring-destructive": removed && !held,
		},
	]}
>
	<MediaImage
		{src}
		{alt}
		{pending}
		class={["size-full transition-opacity", { "opacity-40": removed }]}
		tone="photo"
		size="md"
		loading="lazy"
	/>
	{#if video}
		<div
			class="absolute bottom-2.5 left-2.5 flex size-6 items-center justify-center rounded-full border border-white/10 bg-popover/40 scrim backdrop-filter-(--bd-chip) transition-opacity {removed
				? 'opacity-40'
				: ''}"
		>
			<VideoIcon weight="fill" class="size-3.5" />
		</div>
	{/if}
	{#if onDelete !== undefined}
		<Button
			variant={removed ? "secondary" : "destructive"}
			size="icon-sm"
			class="absolute top-1.5 right-1.5 rounded-full bg-background/80 scrim backdrop-filter-(--bd-veil) hover:bg-background dark:bg-background/80 dark:hover:bg-background"
			onclick={onDelete}
			aria-label={removed ? (undoLabel ?? deleteLabel) : deleteLabel}
		>
			{#if removed}
				<ArrowCounterClockwiseIcon class="size-4" />
			{:else}
				<TrashIcon class="size-4" />
			{/if}
		</Button>
	{/if}
</div>
