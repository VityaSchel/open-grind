<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { cn, type WithElementRef } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		onscroll,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	let atTop = $state(true);
</script>

<div
	bind:this={ref}
	data-slot="drawer-body"
	onscroll={(event) => {
		atTop = event.currentTarget.scrollTop < 1;
		onscroll?.(event);
	}}
	class={cn(
		"min-h-0 overflow-y-auto overscroll-contain",
		{ "touch-pan-down": atTop },
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
