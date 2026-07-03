<script lang="ts">
	import { healthPractices } from "$lib/model/profile";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id="health-practices"
	label="Health Practices"
	items={Object.entries(healthPractices).map(([value, label]) => ({
		value: Number(value),
		label,
	}))}
	convert={Number}
	notSpecified
/>
