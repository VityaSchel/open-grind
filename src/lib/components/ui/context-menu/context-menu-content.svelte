<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import type { ComponentProps } from "svelte";

	import { cn } from "$lib/util/utils.js";
	import type { WithoutChildrenOrChild } from "$lib/util/utils.js";
	import ContextMenuPortal from "./context-menu-portal.svelte";

	let {
		ref = $bindable(null),
		portalProps,
		class: className,
		...restProps
	}: ContextMenuPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<
			ComponentProps<typeof ContextMenuPortal>
		>;
	} = $props();
</script>

<ContextMenuPortal {...portalProps}>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		class={cn(
			"pointer-events-auto z-50 min-w-48 overflow-x-hidden overflow-y-auto rounded-xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
			className,
		)}
		{...restProps}
	/>
</ContextMenuPortal>
