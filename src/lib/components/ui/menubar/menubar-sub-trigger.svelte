<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";

	import { cn, type WithoutChild } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset = undefined,
		children,
		...restProps
	}: WithoutChild<MenubarPrimitive.SubTriggerProps> & {
		inset?: boolean;
	} = $props();
</script>

<MenubarPrimitive.SubTrigger
	bind:ref
	data-slot="menubar-sub-trigger"
	data-inset={inset}
	class={cn(
		"flex cursor-default items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium outline-none select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-9.5 data-open:bg-accent data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	<CaretRightIcon class="cn-rtl-flip ml-auto size-4" />
</MenubarPrimitive.SubTrigger>
