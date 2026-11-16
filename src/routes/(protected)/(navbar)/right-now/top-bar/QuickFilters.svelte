<script lang="ts">
	import FunnelSimpleIcon from "phosphor-svelte/lib/FunnelSimpleIcon";

	import AgeQuickFilter from "#lib/components/filters/age/AgeQuickFilter.svelte";
	import PositionQuickFilter from "#lib/components/filters/position/PositionQuickFilter.svelte";
	import QuickFilterButton from "#lib/components/filters/QuickFilterButton.svelte";
	import { t } from "#lib/i18n/index.ts";
	import type { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";
	import HostingQuickFilter from "./HostingQuickFilter.svelte";

	let { filters }: { filters: RightNowFeedFiltersState } = $props();

	const sortLabelKeys = {
		NEWEST: "browse.rightNow.filters.sort.newest",
		DISTANCE: "browse.rightNow.filters.sort.distance",
	} as const;

	let openFilters = $state({ age: false, position: false, hosting: false });

	const { sort, ageEnabled, positionEnabled, hostingEnabled } = $derived(
		filters.current,
	);
	const sortLabel = $derived(t(sortLabelKeys[sort]));
</script>

<QuickFilterButton
	active
	label={t("browse.rightNow.filters.a11y.sort", { sort: sortLabel })}
	onclick={() =>
		filters.set({ sort: sort === "NEWEST" ? "DISTANCE" : "NEWEST" })}
>
	<FunnelSimpleIcon />
	{sortLabel}
</QuickFilterButton>
<QuickFilterButton active={ageEnabled} onclick={() => (openFilters.age = true)}>
	{t("common.filters.age.label")}
</QuickFilterButton>
<QuickFilterButton
	active={positionEnabled}
	onclick={() => (openFilters.position = true)}
>
	{t("common.filters.position.label")}
</QuickFilterButton>
<QuickFilterButton
	active={hostingEnabled}
	onclick={() => (openFilters.hosting = true)}
>
	{t("browse.rightNow.filters.hosting.label")}
</QuickFilterButton>

<AgeQuickFilter bind:open={openFilters.age} {filters} />
<PositionQuickFilter bind:open={openFilters.position} {filters} />
<HostingQuickFilter bind:open={openFilters.hosting} {filters} />
