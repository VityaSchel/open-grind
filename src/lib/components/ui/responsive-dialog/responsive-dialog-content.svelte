<script lang="ts">
	import type { ComponentProps, Snippet } from "svelte";
	import type { ClassValue } from "svelte/elements";

	import * as Dialog from "#lib/components/ui/dialog/index.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import { cn, type WithoutChildrenOrChild } from "#lib/util/utils.ts";
	import { getResponsiveDialogContext } from "./context.js";

	let {
		class: className,
		dialogClass,
		drawerClass,
		dialogProps,
		drawerProps,
		children,
	}: {
		class?: ClassValue;
		dialogClass?: ClassValue;
		drawerClass?: ClassValue;
		dialogProps?: WithoutChildrenOrChild<
			ComponentProps<typeof Dialog.Content>
		>;
		drawerProps?: WithoutChildrenOrChild<
			ComponentProps<typeof Drawer.Content>
		>;
		children: Snippet;
	} = $props();

	const context = getResponsiveDialogContext("<ResponsiveDialog.Content>");
</script>

{#if context.desktop}
	<Dialog.Content class={cn(className, dialogClass)} {...dialogProps}>
		{@render children()}
	</Dialog.Content>
{:else}
	<Drawer.Content
		class={cn(className, drawerClass)}
		{...drawerProps}
		onInteractOutside={(event) => {
			drawerProps?.onInteractOutside?.(event);
			context.dismissAttempted();
		}}
		onEscapeKeydown={(event) => {
			drawerProps?.onEscapeKeydown?.(event);
			context.dismissAttempted();
		}}
	>
		{@render children()}
	</Drawer.Content>
{/if}
