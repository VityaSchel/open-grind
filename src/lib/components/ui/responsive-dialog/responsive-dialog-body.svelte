<script lang="ts">
	import type { Snippet } from "svelte";
	import type { ClassValue, HTMLAttributes } from "svelte/elements";

	import * as Dialog from "#lib/components/ui/dialog/index.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import { cn, type WithoutChildren } from "#lib/util/utils.ts";
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

	const context = getResponsiveDialogContext("<ResponsiveDialog.Body>");
</script>

{#if context.desktop}
	<Dialog.Body class={cn(className, dialogClass)} {...restProps}>
		{@render children?.()}
	</Dialog.Body>
{:else}
	<Drawer.Body class={cn(className, drawerClass)} {...restProps}>
		{@render children?.()}
	</Drawer.Body>
{/if}
