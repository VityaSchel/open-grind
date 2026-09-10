<script lang="ts">
	import { untrack } from "svelte";
	import type z from "zod";

	import FilterDrawer from "$lib/components/filters/FilterDrawer.svelte";
	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { defaultFilters } from "$lib/model/browse/grid/filters";
	import type { filterPositionSchema } from "$lib/model/browse/grid/filters";

	let { open = $bindable() }: { open: boolean } = $props();

	let filters = $state(gridState.filters.snapshot());
	let { positionEnabled: enabled, positions: value } = $derived(filters);

	$effect(() => {
		if (open) {
			filters = untrack(() => gridState.filters.snapshot());
		}
	});
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title="Positions"
	switchLabel="Filter by position"
	onreset={() => {
		value = defaultFilters.positions;
	}}
	onapply={() =>
		gridState.filters.set({ positionEnabled: enabled, positions: value })}
>
	<PositionFilterToggle
		bind:value={
			() => value,
			(v: z.infer<typeof filterPositionSchema>) => {
				enabled = true;
				value = v;
			}
		}
	/>
</FilterDrawer>
