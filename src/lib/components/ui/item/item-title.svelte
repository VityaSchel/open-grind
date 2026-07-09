<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { cn, type WithElementRef } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="item-title"
	class={cn("font-heading gap-2 text-sm leading-snug font-medium underline-offset-4 line-clamp-1 flex w-fit items-center", className)}
	{...restProps}
>
	{@render children?.()}
</div>
