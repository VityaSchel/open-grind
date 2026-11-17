<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { cn, type WithElementRef } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="drawer-handle"
	class={cn(
		"mx-auto mt-4 hidden h-1.5 w-25 shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block",
		className,
	)}
	{...restProps}
></div>
