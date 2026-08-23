<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";

	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div data-slot="command-input-wrapper" class="p-1 pb-0">
	<InputGroup.Root class="h-11 bg-input/50">
		<CommandPrimitive.Input
			{value}
			data-slot="command-input"
			class={cn(
				"w-full text-base outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-base",
				className,
			)}
			{...restProps}
		>
			{#snippet child({ props })}
				<InputGroup.Input {...props} bind:value bind:ref />
			{/snippet}
		</CommandPrimitive.Input>
		<InputGroup.Addon class="ms-px pe-0.5">
			<MagnifyingGlassIcon class="size-4.5 shrink-0 opacity-50" />
		</InputGroup.Addon>
	</InputGroup.Root>
</div>
