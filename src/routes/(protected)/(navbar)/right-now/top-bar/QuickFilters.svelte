<script lang="ts">
	import FunnelSimpleIcon from "phosphor-svelte/lib/FunnelSimpleIcon";

	import AgeQuickFilter from "#lib/components/filters/age/AgeQuickFilter.svelte";
	import PositionQuickFilter from "#lib/components/filters/position/PositionQuickFilter.svelte";
	import {
		insideQuickFilterBar,
		quickFilterChips,
	} from "#lib/components/filters/quick-filter-chips.svelte.ts";
	import QuickFilterButton from "#lib/components/filters/QuickFilterButton.svelte";
	import { t } from "#lib/i18n/index.ts";
	import type { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";
	import HostingQuickFilter from "./HostingQuickFilter.svelte";

	let { filters }: { filters: RightNowFeedFiltersState } = $props();

	const sortLabelKeys = {
		NEWEST: "browse.rightNow.filters.sort.newest",
		DISTANCE: "browse.rightNow.filters.sort.distance",
	} as const;

	const chips = insideQuickFilterBar() ? quickFilterChips() : undefined;

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
	{@attach chips?.chip("sort")}
>
	<FunnelSimpleIcon />
	{sortLabel}
</QuickFilterButton>
<QuickFilterButton
	active={ageEnabled}
	drawerOpen={openFilters.age}
	onclick={() => (openFilters.age = true)}
	{@attach chips?.chip("age")}
>
	{t("common.filters.age.label")}
</QuickFilterButton>
<QuickFilterButton
	active={positionEnabled}
	drawerOpen={openFilters.position}
	onclick={() => (openFilters.position = true)}
	{@attach chips?.chip("position")}
>
	{t("common.filters.position.label")}
</QuickFilterButton>
<QuickFilterButton
	active={hostingEnabled}
	drawerOpen={openFilters.hosting}
	onclick={() => (openFilters.hosting = true)}
	{@attach chips?.chip("hosting")}
>
	{t("browse.rightNow.filters.hosting.label")}
</QuickFilterButton>

<AgeQuickFilter bind:open={openFilters.age} {filters} />
<PositionQuickFilter bind:open={openFilters.position} {filters} />
<HostingQuickFilter bind:open={openFilters.hosting} {filters} />
