<script lang="ts">
	import {
		PauseIcon,
		PlayIcon,
		SpeakerSimpleHighIcon,
		SpeakerSimpleSlashIcon,
	} from "phosphor-svelte";
	import { sineOut } from "svelte/easing";
	import { fade } from "svelte/transition";
	import type { SvelteMediaTimeRange } from "svelte/elements";

	import { Button } from "$lib/components/ui/button";
	import { formatMediaDuration } from "$lib/util/format-time";
	import VideoScrubber from "./VideoScrubber.svelte";

	let {
		src,
		poster,
		onready,
		onfail,
	}: {
		src: string;
		poster: string | null;
		onready?: () => void;
		onfail?: () => void;
	} = $props();

	let paused = $state(true);
	let muted = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);
	let buffered = $state<SvelteMediaTimeRange[]>([]);

	let hovering = $state(false);
	let focusHeld = $state(false);
	let revealed = $state(true);

	const controlsVisible = $derived(revealed || hovering || focusHeld);

	function enter(event: PointerEvent) {
		if (event.pointerType === "mouse") hovering = true;
	}

	function leave(event: PointerEvent) {
		if (event.pointerType !== "mouse") return;
		hovering = false;
		revealed = false;
	}

	function toggle(event: PointerEvent) {
		if (event.pointerType !== "mouse") revealed = !revealed;
	}

	function focusEntered(event: FocusEvent) {
		focusHeld =
			event.target instanceof Element &&
			event.target.matches(":focus-visible");
	}

	function focusLeft(event: FocusEvent & { currentTarget: HTMLElement }) {
		focusHeld =
			event.relatedTarget instanceof Node &&
			event.currentTarget.contains(event.relatedTarget);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-slot="video-surface"
	class="relative size-full"
	onpointerenter={enter}
	onpointerleave={leave}
	onfocusin={focusEntered}
	onfocusout={focusLeft}
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		onpointerdown={toggle}
		bind:paused
		bind:muted
		bind:currentTime
		bind:duration
		bind:buffered
		{src}
		poster={poster ?? undefined}
		playsinline
		preload="metadata"
		class="size-full object-contain"
		onloadeddata={onready}
		onerror={onfail}
	></video>
	{#if controlsVisible}
		<div
			class="absolute right-[calc(1rem+var(--safe-area-right))] bottom-[calc(1rem+var(--safe-area-bottom))] left-[calc(1rem+var(--safe-area-left))] flex justify-center"
		>
			<div
				data-pswp-interactive
				transition:fade={{ duration: 150, easing: sineOut }}
				class="flex grow items-center gap-3 rounded-full p-3 text-white glass-media-controls-subdued"
			>
				<Button
					variant="outline"
					size="icon-lg"
					aria-label={paused ? "Play" : "Pause"}
					class="shrink-0 cursor-pointer glass-media-controls"
					onclick={() => (paused = !paused)}
				>
					{#if paused}
						<PlayIcon size={22} weight="fill" />
					{:else}
						<PauseIcon size={22} weight="fill" />
					{/if}
				</Button>
				<span class="shrink-0 text-[13px] tracking-tight tabular-nums">
					{formatMediaDuration(currentTime)}
				</span>
				<VideoScrubber
					{currentTime}
					{duration}
					{buffered}
					onseek={(time) => (currentTime = time)}
				/>
				<span class="shrink-0 text-[13px] tracking-tight tabular-nums">
					{formatMediaDuration(duration)}
				</span>
				<Button
					variant="outline"
					size="icon-lg"
					aria-label={muted ? "Unmute" : "Mute"}
					class="shrink-0 cursor-pointer glass-media-controls"
					onclick={() => (muted = !muted)}
				>
					{#if muted}
						<SpeakerSimpleSlashIcon size={22} weight="fill" />
					{:else}
						<SpeakerSimpleHighIcon size={22} weight="fill" />
					{/if}
				</Button>
			</div>
		</div>
	{/if}
</div>
