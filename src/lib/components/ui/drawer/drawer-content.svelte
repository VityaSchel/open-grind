<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";
	import type { ComponentProps } from "svelte";

	import { cn } from "$lib/util/utils.js";
	import type { WithoutChildrenOrChild } from "$lib/util/utils.js";
	import DrawerOverlay from "./drawer-overlay.svelte";
	import DrawerPortal from "./drawer-portal.svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		...restProps
	}: DrawerPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
	} = $props();
</script>

<DrawerPortal {...portalProps}>
	<DrawerOverlay />
	<DrawerPrimitive.Content
		bind:ref
		data-slot="drawer-content"
		class={cn(
			"before:bg-popover before:border-border relative flex h-auto flex-col bg-transparent p-4 text-sm before:absolute before:inset-2 before:-z-10 before:rounded-4xl before:border before:shadow-xl data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:mb-(--safe-area-bottom) data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom))] data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[calc(100dvh-var(--safe-area-top))] data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm group/drawer-content fixed z-50",
			className,
		)}
		{...restProps}
	>
		<div
			class="bg-muted mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block bg-muted mx-auto hidden shrink-0 group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
		></div>
		{@render children?.()}
	</DrawerPrimitive.Content>
</DrawerPortal>
