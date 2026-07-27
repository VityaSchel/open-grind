<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.TriggerProps = $props();
</script>

<MenubarPrimitive.Trigger
	bind:ref
	data-slot="menubar-trigger"
	class={cn(
		"flex items-center rounded-2xl px-2 py-0.75 text-sm font-medium outline-hidden select-none hover:bg-muted aria-expanded:bg-muted",
		className,
	)}
	{...restProps}
/>
