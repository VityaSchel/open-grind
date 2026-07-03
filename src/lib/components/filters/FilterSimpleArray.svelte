<script lang="ts" generics="T extends unknown">
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
		id,
		label,
		items,
		convert,
		notSpecified = false,
	}: {
		checked: boolean;
		value: T[];
		id: string;
		label: string;
		items: { value: T; label: string }[];
		convert: (v: string) => T;
		notSpecified?: boolean;
	} = $props();

	const allItems = $derived(
		notSpecified
			? [...items, { value: convert("-1"), label: "Not Specified" }]
			: items,
	);
</script>

<div class="flex min-w-0 flex-col">
	<FilterDropdown {id} {label} bind:checked>
		<ToggleGroup.Root
			type="multiple"
			variant="outline"
			spacing={2}
			class="w-full flex-wrap gap-1"
			bind:value={
				() => value.map(String),
				(v: string[]) => ((checked = v.length > 0), (value = v.map(convert)))
			}
		>
			{#each allItems as { value, label }}
				<ToggleGroup.Item value={String(value)}>{label}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</FilterDropdown>
</div>
