<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import XIcon from "phosphor-svelte/lib/XIcon";
	import type { Snippet } from "svelte";
	import type { ComponentProps } from "svelte";

	import { Button } from "$lib/components/ui/button/index.js";
	import { exemptToastsFromDismissal } from "$lib/util/toast-interaction";
	import { cn, type WithoutChildrenOrChild } from "$lib/util/utils.js";
	import DialogPortal from "./dialog-portal.svelte";
	import * as Dialog from "./index.js";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton,
		preventOverflowTextSelection = false,
		onInteractOutside,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<
			ComponentProps<typeof DialogPortal>
		>;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"fixed top-1/2 left-1/2 z-50 grid max-h-screen-safe w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 overflow-auto rounded-4xl bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-100 outline-none sm:max-w-md dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
			className,
		)}
		{preventOverflowTextSelection}
		onInteractOutside={exemptToastsFromDismissal(onInteractOutside)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<Button
						variant="ghost"
						class="absolute top-5 right-5.75 bg-secondary"
						size="icon-sm"
						{...props}
					>
						<XIcon />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
