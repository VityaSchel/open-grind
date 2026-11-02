<script lang="ts">
	import type { Component } from "svelte";

	import RadioMark from "#lib/components/shared/RadioMark.svelte";
	import * as Item from "#lib/components/ui/item/index.ts";
	import * as RadioGroup from "#lib/components/ui/radio-group/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		label,
		value = $bindable(),
		options,
	}: {
		label: string;
		value: string;
		options: {
			value: string;
			label: string;
			icon?: Component<{ class?: string }>;
		}[];
	} = $props();
</script>

<RadioGroup.Root
	aria-label={label}
	class="overflow-hidden rounded-2xl border border-border"
	bind:value
>
	{#each options as { value: optionValue, label: optionLabel, icon: Icon } (optionValue)}
		<RadioGroup.Item
			value={optionValue}
			class={cn(
				Item.itemVariants(),
				"rounded-none border-0 text-left not-first:border-t not-first:border-border focus-visible:ring-inset",
			)}
		>
			{#snippet children({ checked })}
				{#if Icon}
					<Item.Media>
						<Icon class="size-5" />
					</Item.Media>
				{/if}
				<Item.Content>
					<Item.Title>{optionLabel}</Item.Title>
				</Item.Content>
				<Item.Actions>
					<RadioMark {checked} />
				</Item.Actions>
			{/snippet}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
