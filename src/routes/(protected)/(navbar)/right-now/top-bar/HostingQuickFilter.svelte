<script lang="ts">
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";
	import PersonSimpleWalkIcon from "phosphor-svelte/lib/PersonSimpleWalkIcon";
	import { untrack } from "svelte";

	import FilterDrawer from "#lib/components/filters/FilterDrawer.svelte";
	import FilterRadioList from "#lib/components/filters/FilterRadioList.svelte";
	import { defaultRightNowFeedFilters } from "#lib/model/right-now/filters.ts";
	import type { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";

	let {
		open = $bindable(),
		filters,
	}: { open: boolean; filters: RightNowFeedFiltersState } = $props();

	const options = [
		{ value: "true", label: "Hosting", icon: HouseIcon },
		{ value: "false", label: "Not hosting", icon: PersonSimpleWalkIcon },
	];

	let draft = $state(untrack(() => filters.snapshot()));
	let { hostingEnabled: enabled, hosting: value } = $derived(draft);

	$effect(() => {
		if (open) {
			draft = untrack(() => filters.snapshot());
		}
	});
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title="Hosting"
	switchLabel="Filter by hosting"
	onreset={() => {
		value = defaultRightNowFeedFilters.hosting;
	}}
	onapply={() => filters.set({ hostingEnabled: enabled, hosting: value })}
>
	<FilterRadioList
		label="Hosting"
		{options}
		bind:value={
			() => String(value),
			(next: string) => {
				enabled = true;
				value = next === "true";
			}
		}
	/>
</FilterDrawer>
