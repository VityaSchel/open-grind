<script lang="ts">
	import type { Snippet } from "svelte";

	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { above } from "$lib/util/breakpoints.svelte";
	import { setResponsiveDialogContext } from "./context.js";

	let {
		open = $bindable(false),
		onOpenChange,
		children,
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		children?: Snippet<[{ desktop: boolean }]>;
	} = $props();

	const isDesktop = above("md");
	setResponsiveDialogContext({
		get desktop() {
			return isDesktop.current;
		},
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

{#if isDesktop.current}
	<Dialog.Root bind:open {onOpenChange}>
		{@render children?.({ desktop: true })}
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open {onOpenChange}>
		{@render children?.({ desktop: false })}
	</Drawer.Root>
{/if}
