<script lang="ts">
	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		WEIGHT_KG_MAX,
		WEIGHT_KG_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatWeightKg } from "$lib/util/units";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(getPreferencesSnapshot().units);
	const min = $derived(value[0] ?? WEIGHT_KG_MIN);
	const max = $derived(value[1] ?? WEIGHT_KG_MAX);
</script>

<div class="block w-full space-y-3">
	<FilterDropdown
		id="weight"
		label="Weight"
		bind:checked
		endLabel={`${min === WEIGHT_KG_MIN ? "No min" : formatWeightKg(min, units)} - ${
			max === WEIGHT_KG_MAX ? "No max" : formatWeightKg(max, units)
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
			min={WEIGHT_KG_MIN}
			max={WEIGHT_KG_MAX}
			step={1}
			thumbLabels={["Minimum weight", "Maximum weight"]}
		/>
	</FilterDropdown>
</div>
