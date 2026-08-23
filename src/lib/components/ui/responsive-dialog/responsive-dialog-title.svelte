<script lang="ts">
	import type { Snippet } from "svelte";
	import type { ClassValue } from "svelte/elements";

	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { cn } from "$lib/util/utils.js";
	import { getResponsiveDialogContext } from "./context.js";

	let {
		class: className,
		children,
	}: { class?: ClassValue; children?: Snippet } = $props();

	const context = getResponsiveDialogContext("<ResponsiveDialog.Title>");
</script>

{#if context.desktop}
	<Dialog.Title class={cn(className)}>{@render children?.()}</Dialog.Title>
{:else}
	<Drawer.Title class={cn(className)}>{@render children?.()}</Drawer.Title>
{/if}
