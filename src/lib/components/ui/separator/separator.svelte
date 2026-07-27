<script lang="ts">
	import { Separator as SeparatorPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		"data-slot": dataSlot = "separator",
		...restProps
	}: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
	bind:ref
	data-slot={dataSlot}
	class={cn(
		"shrink-0 bg-neutral-700 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px",
		"mx-0.5 data-[orientation=vertical]:self-stretch",
		className,
	)}
	{...restProps}
/>
