<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import FilterDropdown from "$lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "$lib/components/ui/slider";
	import { formatRange } from "$lib/i18n/format";
	import {
		rangeBoundTexts,
		WEIGHT_KG_MAX,
		WEIGHT_KG_MIN,
	} from "$lib/model/browse/grid/filters";
	import { formatWeightKg } from "$lib/util/units";
	import { WEIGHT_SLIDER_SCALES } from "./slider-scale";
	import { storedAfterMove, WEIGHT_STOPS } from "./unit-stops";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(preferencesSnapshot().units);
	const stops = $derived(WEIGHT_STOPS[units]);
	const shown = $derived(value.map((weightKg) => stops.toStop(weightKg)));
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
		endLabel={formatRange({ min: minText, max: maxText })}
		contentClass="ps-7 h-6"
	>
		<Slider
			type="multiple"
			bind:value={
				() => shown,
				(moved: number[]) => {
					checked = true;
					value = storedAfterMove({ stops, stored: value, moved });
				}
			}
			scale={WEIGHT_SLIDER_SCALES[units]}
			thumbValueTexts={[minText, maxText]}
			thumbLabels={["Minimum weight", "Maximum weight"]}
		/>
	</FilterDropdown>
</div>
