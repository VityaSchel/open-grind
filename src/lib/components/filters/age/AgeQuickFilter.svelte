<script lang="ts">
	import { untrack } from "svelte";

	import AgeFilterSlider from "#lib/components/filters/age/AgeFilterSlider.svelte";
	import FilterDrawer from "#lib/components/filters/FilterDrawer.svelte";
	import {
		AGE_MAX,
		AGE_MIN,
		ageRangeLabel,
	} from "#lib/model/browse/grid/filters.ts";

	type AgeFilters = { ageEnabled: boolean; age: number[] };

	let {
		open = $bindable(),
		filters,
	}: {
		open: boolean;
		filters: { snapshot(): AgeFilters; set(patch: AgeFilters): void };
	} = $props();

	let draft = $state(untrack(() => filters.snapshot()));
	let { ageEnabled: enabled, age: value } = $derived(draft);

	$effect(() => {
		if (open) {
			draft = untrack(() => filters.snapshot());
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
		value = [AGE_MIN, AGE_MAX];
	}}
	onapply={() => filters.set({ ageEnabled: enabled, age: value })}
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
