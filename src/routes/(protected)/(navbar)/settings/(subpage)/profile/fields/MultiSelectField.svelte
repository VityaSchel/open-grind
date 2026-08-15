<script lang="ts" generics="T extends number">
	import { CaretUpDownIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { Option } from "$lib/util/options";
	import Field from "./Field.svelte";

	let {
		label,
		values = $bindable(),
		options,
		placeholder = "Not set",
	}: {
		label: string;
		values: T[];
		options: Option<T>[];
		placeholder?: string;
	} = $props();

	const selectedLabels = $derived(
		options
			.filter((option) => values.includes(option.value))
			.map((option) => option.label),
	);
</script>

<Field {label}>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					class="h-auto min-h-9 w-full justify-between gap-2 py-1.5 text-left font-normal"
				>
					<span
						class={{
							"text-muted-foreground": !selectedLabels.length,
						}}
					>
						{selectedLabels.length
							? selectedLabels.join(", ")
							: placeholder}
					</span>
					<CaretUpDownIcon class="size-4 shrink-0 opacity-60" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content
			class="max-h-72 w-(--bits-dropdown-menu-anchor-width)"
		>
			<DropdownMenu.CheckboxGroup
				bind:value={
					() => values.map(String),
					(newValue: string[]) => {
						values = options
							.filter((option) =>
								newValue.includes(String(option.value)),
							)
							.map((option) => option.value);
					}
				}
			>
				{#each options as option (option.value)}
					<DropdownMenu.CheckboxItem
						value={String(option.value)}
						closeOnSelect={false}
					>
						{option.label}
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.CheckboxGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</Field>
