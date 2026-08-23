<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";
	import type { ComponentProps } from "svelte";

	import { exemptToastsFromDismissal } from "$lib/util/toast-interaction";
	import { cn } from "$lib/util/utils.js";
	import type { WithoutChildrenOrChild } from "$lib/util/utils.js";
	import DrawerOverlay from "./drawer-overlay.svelte";
	import DrawerPortal from "./drawer-portal.svelte";

	let {
		handle,
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		onInteractOutside,
		preventOverflowTextSelection = false,
		...restProps
	}: DrawerPrimitive.ContentProps & {
		handle?: import("svelte").Snippet | null;
		portalProps?: WithoutChildrenOrChild<
			ComponentProps<typeof DrawerPortal>
		>;
	} = $props();
</script>

{#snippet handleDefault()}
	<div
		data-slot="drawer-handle"
		class="mx-auto mt-4 hidden h-1.5 w-25 shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
	></div>
{/snippet}

<DrawerPortal {...portalProps}>
	<DrawerOverlay />
	<DrawerPrimitive.Content
		bind:ref
		data-slot="drawer-content"
		onInteractOutside={exemptToastsFromDismissal(onInteractOutside)}
		class={cn(
			"group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-sm before:absolute before:inset-2 before:-z-10 before:rounded-4xl before:border before:border-border before:bg-popover before:shadow-xl data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:mb-(--safe-area-bottom) data-[vaul-drawer-direction=bottom]:max-h-screen-safe data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-screen-safe data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
			className,
		)}
		{preventOverflowTextSelection}
		{...restProps}
	>
		{#if handle === undefined}
			{@render handleDefault()}
		{:else}
			{@render handle?.()}
		{/if}
		{@render children?.()}
	</DrawerPrimitive.Content>
</DrawerPortal>
