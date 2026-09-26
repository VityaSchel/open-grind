<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import {
		rangeBoundTexts,
		WEIGHT_KG_MAX,
		WEIGHT_KG_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatWeightKg } from "$lib/util/units";
	import { WEIGHT_SLIDER_SCALE } from "./slider-scale";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(preferencesSnapshot().units);
	const [minText, maxText] = $derived(
		rangeBoundTexts({
			floor: WEIGHT_KG_MIN,
			ceiling: WEIGHT_KG_MAX,
			range: value,
			format: formatWeightKg,
			units,
		}),
	);
</script>

<div class="block w-full space-y-3">
	<FilterDropdown
		id="weight"
		label="Weight"
		bind:checked
		endLabel={`${minText} - ${maxText}`}
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
			scale={WEIGHT_SLIDER_SCALE}
			thumbValueTexts={[minText, maxText]}
			thumbLabels={["Minimum weight", "Maximum weight"]}
		/>
	</FilterDropdown>
</div>
