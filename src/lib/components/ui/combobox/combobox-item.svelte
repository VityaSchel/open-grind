<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import type { Snippet } from "svelte";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		label = "",
		children,
		...restProps
	}: Omit<ComboboxPrimitive.ItemProps, "children"> & {
		children?: Snippet;
	} = $props();
</script>

<ComboboxPrimitive.Item
	bind:ref
	{label}
	data-slot="combobox-item"
	class={cn(
		"flex cursor-default items-center justify-between gap-2 rounded-2xl py-2 pr-2 pl-3 text-sm font-medium outline-hidden select-none in-data-kb-nav:data-highlighted:bg-accent in-data-kb-nav:data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-40 can-hover:data-highlighted:bg-accent can-hover:data-highlighted:text-accent-foreground",
		className,
	)}
	{...restProps}
>
	{#snippet children({ selected })}
		<span>{@render childrenSnippet?.()}</span>
		{#if selected}
			<CheckIcon class="size-4 shrink-0" />
		{/if}
	{/snippet}
</ComboboxPrimitive.Item>

{#snippet childrenSnippet()}
	{@render children?.()}
{/snippet}
