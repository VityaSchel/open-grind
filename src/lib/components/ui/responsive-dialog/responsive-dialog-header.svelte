<script lang="ts">
	import type { Snippet } from "svelte";
	import type { ClassValue, HTMLAttributes } from "svelte/elements";

	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { cn, type WithoutChildren } from "$lib/util/utils.js";
	import { getResponsiveDialogContext } from "./context.js";

	let {
		class: className,
		dialogClass,
		drawerClass,
		children,
		...restProps
	}: WithoutChildren<HTMLAttributes<HTMLDivElement>> & {
		class?: ClassValue;
		dialogClass?: ClassValue;
		drawerClass?: ClassValue;
		children?: Snippet;
	} = $props();

	const context = getResponsiveDialogContext("<ResponsiveDialog.Header>");
</script>

{#if context.desktop}
	<Dialog.Header class={cn(className, dialogClass)} {...restProps}>
		{@render children?.()}
	</Dialog.Header>
{:else}
	<Drawer.Header class={cn(className, drawerClass)} {...restProps}>
		{@render children?.()}
	</Drawer.Header>
{/if}
