<script lang="ts">
	import {
		type ClientRectObject,
		computePosition,
		flip,
		offset,
		type Placement,
		shift,
		type VirtualElement,
	} from "@floating-ui/dom";
	import { untrack } from "svelte";

	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { followViewportResizes } from "$lib/util/follow-viewport-resizes";

	let {
		anchor,
		style,
		content,
		onClose,
		isOut = false,
		selectable = false,
		children,
	}: {
		anchor: VirtualElement;
		style: string;
		onClose: () => void;
		isOut?: boolean;
		selectable?: boolean;
		content: import("svelte").Snippet<[boolean]>;
		children?: import("svelte").Snippet<[Placement]>;
	} = $props();

	const VIEWPORT_SETTLE_MS = 500;

	const preferredPlacement: Placement = $derived(
		isOut ? "left-start" : "right-start",
	);
	const fallbackPlacements: Placement[] = $derived(
		isOut
			? ["right-start", "bottom-end", "top-end"]
			: ["left-start", "bottom-start", "top-start"],
	);

	let contextMenuDialog: HTMLDialogElement | null = $state(null);
	let contextMenuList: HTMLDivElement | null = $state(null);
	let contextMenuListPosition: {
		x: number;
		y: number;
		placement: Placement;
	} = $state({ x: 0, y: 0, placement: "right-start" });
	let liftedBox = $state(untrack(() => anchor.getBoundingClientRect()));

	dismissOnBackGesture({
		active: () => true,
		dismiss: () => contextMenuDialog?.close(),
	});

	function sameBox(a: ClientRectObject, b: ClientRectObject) {
		return (
			a.x === b.x &&
			a.y === b.y &&
			a.width === b.width &&
			a.height === b.height
		);
	}

	$effect(() => {
		const list = contextMenuList;
		if (!list) return;
		let placedBox: ClientRectObject | undefined;
		const place = () => {
			const box = anchor.getBoundingClientRect();
			if (placedBox && sameBox(placedBox, box)) return;
			placedBox = box;
			liftedBox = box;
			computePosition(anchor, list, {
				placement: preferredPlacement,
				middleware: [
					offset(8),
					flip({ fallbackPlacements, fallbackStrategy: "bestFit" }),
					shift({ padding: 8 }),
				],
				strategy: "fixed",
			})
				.then(({ x, y, placement }) => {
					contextMenuListPosition = { x, y, placement };
				})
				.catch((error) => console.error(error));
		};
		place();
		return followViewportResizes({
			settleMs: VIEWPORT_SETTLE_MS,
			onFrame: place,
		});
	});

	$effect(() => {
		if (contextMenuDialog instanceof HTMLDialogElement) {
			contextMenuDialog.showModal();
			contextMenuDialog
				.querySelector<HTMLElement>(
					"[data-slot='context-menu-trigger']",
				)
				?.focus();
		}
	});
</script>

<dialog
	class="menu-scrim fixed top-0 left-0 z-9999 size-full max-h-none max-w-none bg-transparent"
	bind:this={contextMenuDialog}
	onmousedown={(event) => {
		if (
			event.currentTarget === contextMenuDialog &&
			event.currentTarget === event.target
		) {
			contextMenuDialog.close();
		}
	}}
	onclose={() => onClose()}
>
	<div
		class="absolute"
		style:left="{liftedBox.x}px"
		style:top="{liftedBox.y}px"
		style:width="{liftedBox.width}px"
		style:height="{liftedBox.height}px"
		{style}
		inert={!selectable}
	>
		{@render content(true)}
	</div>
	<div
		bind:this={contextMenuList}
		data-slot="context-menu-list"
		class="fixed flex flex-col"
		style:left="{contextMenuListPosition.x}px"
		style:top="{contextMenuListPosition.y}px"
	>
		{@render children?.(contextMenuListPosition.placement)}
	</div>
</dialog>
