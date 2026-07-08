<script lang="ts">
	import {
		BellIcon,
		BellSimpleSlashIcon,
		PushPinIcon,
		PushPinSlashIcon,
		TrashIcon,
		XIcon,
	} from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		count,
		allPinned,
		allMuted,
		onPin,
		onMute,
		onDelete,
		onClose,
	}: {
		count: number;
		allPinned: boolean;
		allMuted: boolean;
		onPin: () => void;
		onMute: () => void;
		onDelete: () => void;
		onClose: () => void;
	} = $props();
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(var(--selection-bar-height)+var(--safe-area-top))] w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex h-full items-center gap-1.5 px-3 pt-(--safe-area-top)"
	tag="nav"
>
	<Button
		size="icon-lg"
		variant="ghost"
		aria-label="Exit selection"
		onclick={onClose}
	>
		<XIcon class="size-6" />
	</Button>
	<span class="flex-1 truncate text-lg font-medium">
		{count} selected
	</span>
	<Button
		size="icon-lg"
		variant="secondary"
		class="size-12"
		aria-label={allPinned ? "Unpin selected" : "Pin selected"}
		onclick={onPin}
	>
		{#if allPinned}
			<PushPinSlashIcon weight="fill" class="size-6" />
		{:else}
			<PushPinIcon weight="fill" class="size-6" />
		{/if}
	</Button>
	<Button
		size="icon-lg"
		variant="secondary"
		class="size-12"
		aria-label={allMuted ? "Unmute selected" : "Mute selected"}
		onclick={onMute}
	>
		{#if allMuted}
			<BellIcon weight="fill" class="size-6" />
		{:else}
			<BellSimpleSlashIcon weight="fill" class="size-6" />
		{/if}
	</Button>
	<Button
		size="icon-lg"
		variant="secondary"
		class="size-12 text-destructive"
		aria-label="Delete selected"
		onclick={onDelete}
	>
		<TrashIcon class="size-6" />
	</Button>
</ProgressiveBlur>
