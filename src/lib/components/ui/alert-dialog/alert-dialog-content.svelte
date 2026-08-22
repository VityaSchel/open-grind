<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import type { ComponentProps } from "svelte";

	import { exemptToastsFromDismissal } from "$lib/util/toast-interaction";
	import {
		cn,
		type WithoutChild,
		type WithoutChildrenOrChild,
	} from "$lib/util/utils.js";
	import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
	import AlertDialogPortal from "./alert-dialog-portal.svelte";

	let {
		ref = $bindable(null),
		class: className,
		size = "default",
		portalProps,
		preventOverflowTextSelection = false,
		onInteractOutside,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: "default" | "sm";
		portalProps?: WithoutChildrenOrChild<
			ComponentProps<typeof AlertDialogPortal>
		>;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			"group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-foreground/5 transition-none duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-md dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
			className,
		)}
		{preventOverflowTextSelection}
		onInteractOutside={exemptToastsFromDismissal(onInteractOutside)}
		{...restProps}
	/>
</AlertDialogPortal>
