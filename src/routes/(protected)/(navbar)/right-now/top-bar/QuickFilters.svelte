<script lang="ts">
	import FunnelSimpleIcon from "phosphor-svelte/lib/FunnelSimpleIcon";

	import AgeQuickFilter from "#lib/components/filters/age/AgeQuickFilter.svelte";
	import PositionQuickFilter from "#lib/components/filters/position/PositionQuickFilter.svelte";
	import QuickFilterButton from "#lib/components/filters/QuickFilterButton.svelte";
	import type { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";
	import HostingQuickFilter from "./HostingQuickFilter.svelte";

	let { filters }: { filters: RightNowFeedFiltersState } = $props();

	const sortLabels = { NEWEST: "Newest", DISTANCE: "Distance" };

	let openFilters = $state({ age: false, position: false, hosting: false });

	const { sort, ageEnabled, positionEnabled, hostingEnabled } = $derived(
		filters.current,
	);
	const sortLabel = $derived(sortLabels[sort]);
</script>

<QuickFilterButton
	active
	label="Sort: {sortLabel}"
	onclick={() =>
		filters.set({ sort: sort === "NEWEST" ? "DISTANCE" : "NEWEST" })}
>
	<FunnelSimpleIcon />
	{sortLabel}
</QuickFilterButton>
<QuickFilterButton active={ageEnabled} onclick={() => (openFilters.age = true)}>
	Age
</QuickFilterButton>
<QuickFilterButton
	active={positionEnabled}
	onclick={() => (openFilters.position = true)}
>
	Position
</QuickFilterButton>
<QuickFilterButton
	active={hostingEnabled}
	onclick={() => (openFilters.hosting = true)}
>
	Hosting
</QuickFilterButton>

<AgeQuickFilter bind:open={openFilters.age} {filters} />
<PositionQuickFilter bind:open={openFilters.position} {filters} />
<HostingQuickFilter bind:open={openFilters.hosting} {filters} />
