<script lang="ts">
	import { relationshipStatuses } from "$lib/model/profile";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id="relationship-status"
	label="Relationship Status"
	items={Object.entries(relationshipStatuses).map(([value, label]) => ({
		value: Number(value),
		label,
	}))}
	convert={Number}
	notSpecified
/>
