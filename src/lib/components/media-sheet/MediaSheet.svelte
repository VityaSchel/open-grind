<script lang="ts">
	import type { Snippet } from "svelte";

	import * as Drawer from "$lib/components/ui/drawer";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(),
		fullsize = true,
		children,
	}: { open: boolean; fullsize?: boolean; children: Snippet } = $props();

	let pressedOutside = false;

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

<Drawer.Root bind:open>
	<Drawer.Content
		class={[
			"mx-auto max-w-media-panel border-none bg-transparent p-0 shadow-none before:hidden",
			{ "h-full": fullsize, "h-fit": !fullsize },
		]}
		handle={null}
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
