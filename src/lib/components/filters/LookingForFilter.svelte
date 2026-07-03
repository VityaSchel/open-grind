<script lang="ts">
	import { lookingFor } from "$lib/model/profile";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id="looking-for"
	label="Looking for"
	items={Object.entries(lookingFor).map(([value, label]) => ({
		value: Number(value),
		label,
	}))}
	convert={Number}
	notSpecified
/>
