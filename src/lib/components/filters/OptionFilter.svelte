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
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id={filter.id}
	label={filter.label}
	items={optionsFromMap(filter.table)}
	convert={Number}
	notSpecified
/>
