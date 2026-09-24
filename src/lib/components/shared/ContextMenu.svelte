<script lang="ts">
	import {
		computePosition,
		flip,
		offset,
		type Placement,
		shift,
		type VirtualElement,
	} from "@floating-ui/dom";
	import { type Snippet, untrack } from "svelte";

	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { followViewportResizes } from "$lib/util/follow-viewport-resizes";

	let {
		anchor,
		style,
		content,
		onClose,
		isOut = false,
		selectable = false,
		header,
		children,
	}: {
		anchor: VirtualElement;
		style: string;
		onClose: () => void;
		isOut?: boolean;
		selectable?: boolean;
		content: Snippet<[boolean]>;
		header?: Snippet;
		children?: Snippet;
	} = $props();

	const VIEWPORT_SETTLE_MS = 500;
	const EDGE_GAP_PX = 8;

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
	let contextMenuItems: HTMLDivElement | null = $state(null);
	let contextMenuListPosition = $state({ x: 0, y: 0 });
	let liftedBox = $state(untrack(() => anchor.getBoundingClientRect()));

	dismissOnBackGesture({
		active: () => true,
		dismiss: () => contextMenuDialog?.close(),
	});

	function safeAreaPadding() {
		const rootStyle = getComputedStyle(document.documentElement);
		const clearance = (side: "top" | "right" | "bottom" | "left") =>
			(parseFloat(rootStyle.getPropertyValue(`--safe-area-${side}`)) ||
				0) + EDGE_GAP_PX;
		return {
			top: clearance("top"),
			right: clearance("right"),
			bottom: clearance("bottom"),
			left: clearance("left"),
		};
	}

	$effect(() => {
		const list = contextMenuList;
		if (!list) return;
		const place = () => {
			liftedBox = anchor.getBoundingClientRect();
			const padding = safeAreaPadding();
			computePosition(anchor, list, {
				placement: preferredPlacement,
				middleware: [
					offset(({ placement }) => ({
						mainAxis: EDGE_GAP_PX,
						alignmentAxis:
							placement.startsWith("left") ||
							placement.startsWith("right")
								? -(contextMenuItems?.offsetTop ?? 0)
								: 0,
					})),
					flip({
						fallbackPlacements,
						fallbackStrategy: "bestFit",
						padding,
					}),
					shift({ padding, crossAxis: true }),
				],
				strategy: "fixed",
			})
				.then(({ x, y }) => {
					contextMenuListPosition = { x, y };
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
		{@render header?.()}
		<div bind:this={contextMenuItems}>
			{@render children?.()}
		</div>
	</div>
</dialog>
