<script lang="ts">
	import { CaretUpDownIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { Option } from "$lib/util/options";
	import Field from "./Field.svelte";

	let {
		label,
		value = $bindable(),
		options,
		placeholder = "Not set",
		clearLabel = "Not set",
		nullable = true,
	}: {
		label: string;
		value: number | null;
		options: Option[];
		placeholder?: string;
		clearLabel?: string;
		nullable?: boolean;
	} = $props();

	const selected = $derived(options.find((option) => option.value === value));
</script>

<Field {label}>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					class="w-full justify-between font-normal"
				>
					<span class={{ "text-muted-foreground": !selected }}>
						{selected?.label ?? placeholder}
					</span>
					<CaretUpDownIcon class="size-4 shrink-0 opacity-60" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content
			class="max-h-72 w-(--bits-dropdown-menu-anchor-width)"
		>
			<DropdownMenu.RadioGroup
				bind:value={
					() => (value === null ? "" : String(value)),
					(next) => (value = next === "" ? null : Number(next))
				}
			>
				{#if nullable}
					<DropdownMenu.RadioItem value=""
						>{clearLabel}</DropdownMenu.RadioItem
					>
				{/if}
				{#each options as option (option.value)}
					<DropdownMenu.RadioItem value={String(option.value)}>
						{option.label}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</Field>
