<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		"group/command-item xs:text-base relative flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium outline-hidden select-none in-data-[slot=dialog-content]:rounded-xl! data-selected:bg-muted data-selected:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 data-selected:*:[svg]:text-foreground",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	<CheckIcon
		class="cn-command-item-indicator ml-auto opacity-0 group-has-[[data-slot=command-shortcut]]/command-item:hidden group-data-[checked=true]/command-item:opacity-100"
	/>
</CommandPrimitive.Item>
