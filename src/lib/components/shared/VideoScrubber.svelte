<script lang="ts">
	import type { SvelteMediaTimeRange } from "svelte/elements";

	import { formatMediaDuration } from "$lib/util/format-time";

	const STEP_SECONDS = 5;

	let {
		currentTime,
		duration,
		buffered,
		onseek,
	}: {
		currentTime: number;
		duration: number;
		buffered: SvelteMediaTimeRange[];
		onseek: (time: number) => void;
	} = $props();

	let track = $state<HTMLDivElement>();
	let thumb = $state<HTMLDivElement>();
	let scrubbing = $state(false);

	const played = $derived(
		duration > 0 ? Math.min(currentTime / duration, 1) : 0,
	);

	const loaded = $derived.by(() => {
		if (duration <= 0) return 0;
		const reached = buffered.find(
			({ start, end }) => start <= currentTime && currentTime <= end,
		);
		return reached === undefined ? 0 : reached.end / duration;
	});

	/** Inset by half a thumb at either end, so the thumb stays inside the track. */
	const playhead = $derived(
		`calc(${played} * (100% - var(--thumb-width)) + var(--thumb-width) / 2)`,
	);

	function seekTo(time: number) {
		onseek(Math.min(duration, Math.max(0, time)));
	}

	function seekToPointer(event: PointerEvent) {
		if (track === undefined || duration <= 0) return;
		const { left, width } = track.getBoundingClientRect();
		const inset = (thumb?.offsetWidth ?? 0) / 2;
		const travel = width - inset * 2;
		if (travel <= 0) return;
		seekTo(((event.clientX - left - inset) / travel) * duration);
	}

	function grab(event: PointerEvent) {
		scrubbing = true;
		track?.setPointerCapture(event.pointerId);
		seekToPointer(event);
	}

	function release(event: PointerEvent) {
		scrubbing = false;
		track?.releasePointerCapture(event.pointerId);
	}

	function seekByKey(event: KeyboardEvent) {
		if (event.key === "ArrowLeft") seekTo(currentTime - STEP_SECONDS);
		else if (event.key === "ArrowRight") seekTo(currentTime + STEP_SECONDS);
		else if (event.key === "Home") seekTo(0);
		else if (event.key === "End") seekTo(duration);
		else return;
		event.preventDefault();
	}
</script>

<div
	bind:this={track}
	role="slider"
	tabindex="0"
	aria-label="Seek"
	aria-valuemin={0}
	aria-valuemax={duration}
	aria-valuenow={currentTime}
	aria-valuetext={formatMediaDuration(currentTime)}
	class="relative flex h-8 min-w-16 grow cursor-pointer touch-none items-center outline-hidden [--thumb-width:1.5rem]"
	onpointerdown={grab}
	onpointermove={(event) => scrubbing && seekToPointer(event)}
	onpointerup={release}
	onpointercancel={release}
	onkeydown={seekByKey}
>
	<div
		class="relative h-1.75 w-full overflow-hidden rounded-full bg-white/25"
	>
		<div
			data-slot="scrubber-buffered"
			class="absolute inset-y-0 left-0 bg-white/40"
			style:width={`${loaded * 100}%`}
		></div>
		<div
			data-slot="scrubber-played"
			class="absolute inset-y-0 left-0 bg-white"
			style:width={playhead}
		></div>
	</div>
	<div
		bind:this={thumb}
		data-slot="scrubber-thumb"
		class={[
			"pointer-events-none absolute h-4.5 w-(--thumb-width) -translate-x-1/2 rounded-full transition-[background-color,scale] glass-clear",
			{
				"scale-150 bg-transparent": scrubbing,
				"scale-100 bg-white": !scrubbing,
			},
		]}
		style:left={playhead}
		style:transform-origin="{played * 100}% center"
	></div>
</div>
