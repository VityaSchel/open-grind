<script lang="ts" generics="T extends number">
	import { CaretUpDownIcon } from "phosphor-svelte";

	import Field from "$lib/components/fields/Field.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { Option } from "$lib/util/options";

	let {
		label,
		value = $bindable(),
		options,
		placeholder = "Not set",
		clearLabel = "Not set",
		nullable = true,
	}: {
		label: string;
		value: T | null;
		options: Option<T>[];
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
					(next) =>
						(value =
							options.find(
								(option) => String(option.value) === next,
							)?.value ?? null)
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
