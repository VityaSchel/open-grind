<script lang="ts">
	import type { Snippet } from "svelte";

	import { anchorToastsAbove } from "#lib/components/feedback/toast-anchor.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";

	let {
		open = $bindable(),
		fullsize = true,
		onCloseAutoFocus,
		children,
	}: {
		open: boolean;
		fullsize?: boolean;
		onCloseAutoFocus?: (event: Event) => void;
		children: Snippet;
	} = $props();

	const SHEET_PANEL = '[data-slot="sheet-panel"]';
	const TOAST_GAP_PX = 8;

	let pressedOutside = false;
	let content = $state<HTMLElement | null>(null);

	$effect(() => {
		const sheet = content;
		if (open && sheet) return anchorToastsAbove(() => panelEdge(sheet));
	});

	function panelEdge(sheet: HTMLElement): number | null {
		const panel = sheet.querySelector<HTMLElement>(SHEET_PANEL);
		if (panel === null) return null;
		return panel.getBoundingClientRect().top - TOAST_GAP_PX;
	}

	function isScroller(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLDivElement &&
			target.dataset.slot === "sheet-scroller"
		);
	}

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<Drawer.Root bind:open repositionInputs={false}>
	<Drawer.Content
		bind:ref={content}
		class={[
			"mx-auto max-w-media-panel border-none bg-transparent p-0 shadow-none [--sheet-actions-clearance:calc(--spacing(30)+var(--bar-content-gap))] [--sheet-panel-padding-bottom:--spacing(20)] before:hidden",
			{ "h-full": fullsize, "h-fit": !fullsize },
		]}
		handle={null}
		{onCloseAutoFocus}
		onpointerdown={(e) => (pressedOutside = isScroller(e.target))}
		onclick={(e) => {
			const outside = pressedOutside && isScroller(e.target);
			pressedOutside = false;
			if (outside) open = false;
		}}
	>
		{@render children()}
	</Drawer.Content>
</Drawer.Root>
