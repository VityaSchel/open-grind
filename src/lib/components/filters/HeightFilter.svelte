<script lang="ts">
	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		HEIGHT_CM_MAX,
		HEIGHT_CM_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatHeight } from "$lib/util/units";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(getPreferencesSnapshot().units);
	const min = $derived(value[0] ?? HEIGHT_CM_MIN);
	const max = $derived(value[1] ?? HEIGHT_CM_MAX);
</script>

<div class="block w-full space-y-3">
	<FilterDropdown
		id="height"
		label="Height"
		bind:checked
		endLabel={`${min === HEIGHT_CM_MIN ? "No min" : formatHeight(min, units)} - ${
			max === HEIGHT_CM_MAX ? "No max" : formatHeight(max, units)
		}`}
		contentClass="ps-7 h-6"
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
			min={HEIGHT_CM_MIN}
			max={HEIGHT_CM_MAX}
			step={1}
			thumbLabels={["Minimum height", "Maximum height"]}
		/>
	</FilterDropdown>
</div>
