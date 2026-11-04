<script lang="ts">
	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import FilterDropdown from "#lib/components/filters/FilterDropdown.svelte";
	import { Slider } from "#lib/components/ui/slider/index.ts";
	import { formatRange } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		HEIGHT_CM_MAX,
		HEIGHT_CM_MIN,
		rangeBoundTexts,
	} from "#lib/model/browse/grid/filters.ts";
	import { formatHeight } from "#lib/util/units.ts";
	import { HEIGHT_STOPS, storedAfterMove } from "./unit-stops";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const units = $derived(preferencesSnapshot().units);
	const stops = $derived(HEIGHT_STOPS[units]);
	const shown = $derived(value.map((heightCm) => stops.toStop(heightCm)));
	const [minText, maxText] = $derived(
		rangeBoundTexts({
			floor: HEIGHT_CM_MIN,
			ceiling: HEIGHT_CM_MAX,
			range: value,
			format: formatHeight,
			units,
		}),
	);
</script>

<div class="block w-full space-y-3">
	<FilterDropdown
		id="height"
		label={t("common.filters.height.label")}
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
			min={stops.first}
			max={stops.last}
			step={1}
			thumbValueTexts={[minText, maxText]}
			thumbLabels={[
				t("browse.filters.height.a11y.minimum"),
				t("browse.filters.height.a11y.maximum"),
			]}
		/>
	</FilterDropdown>
</div>
