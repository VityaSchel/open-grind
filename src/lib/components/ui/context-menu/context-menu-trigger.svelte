<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ContextMenuPrimitive.TriggerProps = $props();
</script>

<ContextMenuPrimitive.Trigger
	bind:ref
	data-slot="context-menu-trigger"
	class={cn(
		"cn-context-menu-trigger select-none in-data-context-menu-open:*:pointer-events-none",
		className,
	)}
	{...restProps}
/>
