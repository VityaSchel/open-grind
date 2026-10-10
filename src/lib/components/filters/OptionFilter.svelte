<script lang="ts">
	import { optionsFromMap } from "$lib/util/options";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";
	import type { OptionFilterDefinition } from "./option-filters";

	let {
		filter,
		checked = $bindable(),
		value = $bindable(),
	}: {
		filter: OptionFilterDefinition;
		checked: boolean;
		value: number[];
	} = $props();

	const items = $derived(
		optionsFromMap(filter.table).filter(
			(option) => filter.isOffered?.(option.value) ?? true,
		),
	);
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id={filter.id}
	label={filter.label}
	{items}
	convert={Number}
	notSpecified
/>
