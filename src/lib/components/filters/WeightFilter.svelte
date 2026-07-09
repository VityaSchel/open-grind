<script lang="ts">
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import { formatWeightKg } from "$lib/util/units";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(getUnitsSnapshot());
</script>

<div class="block space-y-3 w-full">
	<FilterDropdown
		id="weight"
		label="Weight"
		bind:checked
		endLabel={`${value[0] === 40 ? "No min" : formatWeightKg(value[0], units)} - ${
			value[1] === 273 ? "No max" : formatWeightKg(value[1], units)
		}`}
		contentClass="ps-7 h-5"
	>
		<Slider
			type="multiple"
			bind:value={
				() => value,
				(v: number[]) => {
					checked = true;
					value = v;
				}
			}
			min={40}
			max={273}
			step={1}
		/>
	</FilterDropdown>
</div>
