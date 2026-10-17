<script lang="ts">
	import type { Snippet } from "svelte";

	import * as Drawer from "$lib/components/ui/drawer";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { anchorToastsAbove } from "./toast-anchor";

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

	let pressedOutside = false;
	let content = $state<HTMLElement | null>(null);

	$effect(() => {
		if (open && content) return anchorToastsAbove(content);
	});

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
			"mx-auto max-w-media-panel border-none bg-transparent p-0 shadow-none before:hidden",
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
