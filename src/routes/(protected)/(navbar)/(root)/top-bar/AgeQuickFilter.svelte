<script lang="ts">
	import { untrack } from "svelte";

	import AgeFilterSlider from "$lib/components/filters/age/AgeFilterSlider.svelte";
	import FilterDrawer from "$lib/components/filters/FilterDrawer.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import {
		ageRangeLabel,
		defaultFilters,
	} from "$lib/model/browse/grid/filters";

	let { open = $bindable() }: { open: boolean } = $props();

	let filters = $state(gridState.filters.snapshot());
	let { ageEnabled: enabled, age: value } = $derived(filters);

	$effect(() => {
		if (open) {
			filters = untrack(() => gridState.filters.snapshot());
		}
	});

	const label = $derived(ageRangeLabel(value));
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title="Age"
	switchLabel="Filter by age"
	onreset={() => {
		value = defaultFilters.age;
	}}
	onapply={() => gridState.filters.set({ ageEnabled: enabled, age: value })}
>
	<div class="mb-2 w-full text-center">{label}</div>
	<AgeFilterSlider
		bind:value={
			() => value,
			(v: number[]) => {
				enabled = true;
				value = v;
			}
		}
	/>
</FilterDrawer>
