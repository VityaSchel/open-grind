<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";

	export type CommandRootApi = CommandPrimitive.Root;

	let {
		api = $bindable(null),
		ref = $bindable(null),
		value = $bindable(""),
		class: className,
		...restProps
	}: CommandPrimitive.RootProps & {
		api?: CommandRootApi | null;
	} = $props();
</script>

<CommandPrimitive.Root
	bind:this={api}
	bind:value
	bind:ref
	data-slot="command"
	class={cn("bg-popover text-popover-foreground rounded-4xl p-1 flex size-full flex-col overflow-hidden", className)}
	{...restProps}
/>
