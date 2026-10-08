<script lang="ts">
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import { type Snippet, untrack } from "svelte";

	import ContextMenu from "$lib/components/shared/ContextMenu.svelte";
	import ContextMenuPanel from "$lib/components/shared/ContextMenuPanel.svelte";
	import { Button } from "$lib/components/ui/button";
	import MediaTileOverlay from "./MediaTileOverlay.svelte";
	import { isPastMiddleColumn } from "./tile-menu.svelte";

	let {
		tile,
		video,
		selected,
		onDelete,
		onClose,
		overlay,
	}: {
		tile: HTMLButtonElement;
		video: boolean;
		selected: boolean;
		onDelete: () => void;
		onClose: () => void;
		overlay?: Snippet;
	} = $props();

	const { pastMiddle, corners } = untrack(() => ({
		pastMiddle: isPastMiddleColumn(tile),
		corners: getComputedStyle(tile).borderRadius,
	}));

	let image = $state<string | null>(null);
	let frame = $state<HTMLVideoElement | null>(null);

	function syncMedia() {
		const loadedImage = tile.querySelector("img");
		const loadedFrame = tile.querySelector("video");
		image =
			loadedImage !== null &&
			loadedImage.complete &&
			loadedImage.naturalWidth > 1
				? loadedImage.currentSrc
				: null;
		frame =
			loadedFrame !== null &&
			loadedFrame.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
				? loadedFrame
				: null;
	}

	$effect(() => {
		syncMedia();
		tile.addEventListener("load", syncMedia, true);
		tile.addEventListener("loadeddata", syncMedia, true);
		return () => {
			tile.removeEventListener("load", syncMedia, true);
			tile.removeEventListener("loadeddata", syncMedia, true);
		};
	});

	function drawFrame(canvas: HTMLCanvasElement) {
		if (frame === null) return;
		canvas.width = frame.videoWidth;
		canvas.height = frame.videoHeight;
		canvas.getContext("2d")?.drawImage(frame, 0, 0);
	}
</script>

<div
	role="presentation"
	class="contents"
	data-vaul-no-drag
	onkeydown={(event) => {
		if (event.key === "Escape") event.stopPropagation();
	}}
	oncontextmenu={(event) => event.preventDefault()}
>
	<ContextMenu anchor={tile} isOut={pastMiddle} {onClose}>
		{#snippet content()}
			<div
				data-slot="media-tile-lifted"
				class="relative size-full overflow-hidden bg-card-foreground/10 shadow-xl"
				style:border-radius={corners}
			>
				{#if frame !== null}
					<canvas class="size-full object-cover" {@attach drawFrame}
					></canvas>
				{:else if image !== null}
					<img
						src={image}
						alt=""
						draggable="false"
						class="size-full object-cover"
					/>
				{/if}
				<MediaTileOverlay {video} {selected} {overlay} />
			</div>
		{/snippet}
		<ContextMenuPanel label={`${video ? "Video" : "Photo"} options`}>
			<Button
				variant="ghost"
				role="menuitem"
				class="text-destructive"
				onclick={(event) => {
					event.currentTarget.closest("dialog")?.close();
					onDelete();
				}}
			>
				<TrashIcon /> Delete permanently
			</Button>
		</ContextMenuPanel>
	</ContextMenu>
</div>
