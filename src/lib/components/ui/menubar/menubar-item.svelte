<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset = undefined,
		variant = "default",
		...restProps
	}: MenubarPrimitive.ItemProps & {
		inset?: boolean;
		variant?: "default" | "destructive";
	} = $props();
</script>

<MenubarPrimitive.Item
	bind:ref
	data-slot="menubar-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(
		"group/menubar-item flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive!",
		className,
	)}
	{...restProps}
/>
