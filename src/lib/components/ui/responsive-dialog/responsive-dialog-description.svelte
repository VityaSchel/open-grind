<script lang="ts">
	import type { Snippet } from "svelte";
	import type { ClassValue } from "svelte/elements";

	import * as Dialog from "#lib/components/ui/dialog/index.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import { cn } from "#lib/util/utils.ts";
	import { getResponsiveDialogContext } from "./context.js";

	let {
		class: className,
		children,
	}: { class?: ClassValue; children?: Snippet } = $props();

	const context = getResponsiveDialogContext(
		"<ResponsiveDialog.Description>",
	);
</script>

{#if context.desktop}
	<Dialog.Description class={cn(className)}>
		{@render children?.()}
	</Dialog.Description>
{:else}
	<Drawer.Description class={cn(className)}>
		{@render children?.()}
	</Drawer.Description>
{/if}
