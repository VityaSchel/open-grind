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
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof ContextMenuPortal>>;
	} = $props();
</script>

<ContextMenuPortal {...portalProps}>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		class={cn(
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/5 dark:ring-foreground/10 bg-popover text-popover-foreground pointer-events-auto min-w-48 rounded-xl p-1.5 shadow-lg ring-1 duration-100 z-50 overflow-x-hidden overflow-y-auto outline-none",
			className
		)}
		{...restProps}
	/>
</ContextMenuPortal>
