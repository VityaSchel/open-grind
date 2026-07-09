<script lang="ts">
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import { formatHeight } from "$lib/util/units";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(getUnitsSnapshot());
</script>

<div class="block space-y-3 w-full">
	<FilterDropdown
		id="height"
		label="Height"
		bind:checked
		endLabel={`${value[0] === 120 ? "No min" : formatHeight(value[0], units)} - ${
			value[1] === 242 ? "No max" : formatHeight(value[1], units)
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
			min={120}
			max={242}
			step={1}
		/>
	</FilterDropdown>
</div>
