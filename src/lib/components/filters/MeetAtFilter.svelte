<script lang="ts">
	import { meetAt } from "$lib/model/profile";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id="meet-at"
	label="Meet at"
	items={Object.entries(meetAt).map(([value, label]) => ({
		value: Number(value),
		label,
	}))}
	convert={Number}
	notSpecified
/>
