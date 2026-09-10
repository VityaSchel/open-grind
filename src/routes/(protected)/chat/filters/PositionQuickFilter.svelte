<script lang="ts">
	import { untrack } from "svelte";

	import FilterDrawer from "$lib/components/filters/FilterDrawer.svelte";
	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import type { FilterPositionId } from "$lib/model/browse/grid/filters";

	let {
		open = $bindable(),
		positions,
		onapply,
	}: {
		open: boolean;
		positions: FilterPositionId[];
		onapply: (positions: FilterPositionId[]) => void;
	} = $props();

	let enabled = $state(false);
	let value = $state<FilterPositionId[]>([]);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			enabled = positions.length > 0;
			value = [...positions];
		});
	});
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title="Positions"
	switchLabel="Filter by position"
	onreset={() => (value = [])}
	onapply={() => onapply(enabled ? value.toSorted((a, b) => a - b) : [])}
>
	<PositionFilterToggle
		bind:value={
			() => value,
			(next: FilterPositionId[]) => {
				enabled = true;
				value = next;
			}
		}
	/>
</FilterDrawer>
