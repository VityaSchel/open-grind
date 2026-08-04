<script lang="ts">
	import { tribes } from "$lib/model/users/profiles";
	import type { FilterTribeId } from "$lib/model/browse/grid/filters";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: FilterTribeId[] } = $props();
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id="tribes"
	label="Tribes"
	items={Object.entries(tribes).map(([value, label]) => ({
		value: Number(value),
		label,
	}))}
	convert={Number}
	notSpecified
/>
