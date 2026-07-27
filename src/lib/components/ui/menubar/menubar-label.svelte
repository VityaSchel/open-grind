<script lang="ts">
	import { type WithElementRef } from "bits-ui";
	import type { HTMLAttributes } from "svelte/elements";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		inset,
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		inset?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="menubar-label"
	data-inset={inset}
	class={cn(
		"px-3.5 py-2.5 text-xs text-muted-foreground data-inset:pl-9.5",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
