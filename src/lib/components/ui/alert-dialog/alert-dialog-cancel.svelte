<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	import {
		type ButtonSize,
		type ButtonVariant,
		buttonVariants,
	} from "#lib/components/ui/button/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		variant = "outline",
		size = "default",
		...restProps
	}: AlertDialogPrimitive.CancelProps & {
		variant?: ButtonVariant;
		size?: ButtonSize;
	} = $props();
</script>

<AlertDialogPrimitive.Cancel
	bind:ref
	data-slot="alert-dialog-cancel"
	class={cn(
		buttonVariants({ variant, size }),
		"cn-alert-dialog-cancel",
		className,
	)}
	{...restProps}
/>
