<script lang="ts">
	import type { Snippet } from "svelte";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import VideoPreview from "$lib/components/shared/VideoPreview.svelte";
	import { longPressHandlers } from "$lib/util/long-press";
	import MediaTileOverlay from "./MediaTileOverlay.svelte";

	let {
		src,
		video,
		index,
		selected,
		clickable,
		busy = false,
		lifted = false,
		onclick,
		onMenu,
		overlay,
	}: {
		src: string | null;
		video: boolean;
		index: number;
		selected: boolean;
		clickable: boolean;
		busy?: boolean;
		lifted?: boolean;
		onclick: () => void;
		onMenu?: (tile: HTMLButtonElement) => void;
		overlay?: Snippet;
	} = $props();

	const label = $derived(`${video ? "Video" : "Photo"} ${index + 1}`);

	let tile = $state<HTMLButtonElement | null>(null);
	let pressedHere = false;
	let touchDown = false;
	let openedByTouch = false;

	function openMenu() {
		pressedHere = false;
		openedByTouch = touchDown;
		if (busy || tile === null || onMenu === undefined) return;
		tile.focus({ preventScroll: true });
		onMenu(tile);
	}

	const longPress = longPressHandlers(openMenu);
	const menuReady = $derived(onMenu !== undefined && !busy);
</script>

<button
	bind:this={tile}
	type="button"
	data-slot="media-tile"
	data-vaul-no-drag={lifted ? "" : undefined}
	class={[
		"relative aspect-(--photo-grid-aspect)",
		{
			"cursor-pointer": clickable && !busy,
			"opacity-50": busy,
			"opacity-0": lifted,
		},
	]}
	aria-label={video ? label : undefined}
	aria-pressed={selected}
	aria-disabled={busy}
	onpointerdown={(event) => {
		pressedHere = true;
		touchDown = event.pointerType !== "mouse";
		openedByTouch = false;
		if (menuReady) longPress.onpointerdown?.(event);
	}}
	onpointermove={(event) => longPress.onpointermove?.(event)}
	onpointerup={(event) => {
		touchDown = false;
		longPress.onpointerup?.(event);
	}}
	onpointercancel={(event) => {
		touchDown = false;
		longPress.onpointercancel?.(event);
	}}
	ontouchend={(event) => {
		if (!openedByTouch) return;
		openedByTouch = false;
		event.preventDefault();
	}}
	onclick={(event) => {
		const pressed = pressedHere || event.detail === 0;
		pressedHere = false;
		if (pressed && !busy) onclick();
	}}
	oncontextmenu={onMenu === undefined
		? undefined
		: (event) => {
				event.stopPropagation();
				if (menuReady) longPress.oncontextmenu?.(event);
				else event.preventDefault();
			}}
>
	{#if video}
		{#if src !== null}
			<VideoPreview
				{src}
				class="size-full rounded-[inherit] bg-card-foreground/10"
			/>
		{/if}
	{:else}
		<MediaImage
			{src}
			alt={label}
			loading="lazy"
			class="size-full rounded-[inherit]"
			imgClass="bg-card-foreground/10"
		/>
	{/if}
	<MediaTileOverlay {video} {selected} {overlay} />
</button>
