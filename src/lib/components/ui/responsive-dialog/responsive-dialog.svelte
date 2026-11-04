<script lang="ts">
	import type { Snippet } from "svelte";

	import * as Dialog from "#lib/components/ui/dialog/index.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { above } from "#lib/util/breakpoints.svelte.ts";
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
