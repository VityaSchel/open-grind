<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";
	import CaretUpDownIcon from "phosphor-svelte/lib/CaretUpDownIcon";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: ComboboxPrimitive.TriggerProps = $props();
</script>

<ComboboxPrimitive.Trigger
	bind:ref
	data-slot="combobox-trigger"
	class={cn(
		"absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground",
		className,
	)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		<CaretUpDownIcon class="size-4 opacity-60" />
	{/if}
</ComboboxPrimitive.Trigger>
