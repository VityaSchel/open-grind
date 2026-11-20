<script lang="ts">
	import SlidersHorizontalIcon from "phosphor-svelte/lib/SlidersHorizontalIcon";

	import { genderFilterFlag } from "#lib/api/feature-flags-state.svelte.ts";
	import AgeQuickFilter from "#lib/components/filters/age/AgeQuickFilter.svelte";
	import PositionQuickFilter from "#lib/components/filters/position/PositionQuickFilter.svelte";
	import { quickFilterChips } from "#lib/components/filters/quick-filter-chips.svelte.ts";
	import QuickFilterButton from "#lib/components/filters/QuickFilterButton.svelte";
	import QuickFilterToggle from "#lib/components/filters/QuickFilterToggle.svelte";
	import { gridState } from "#lib/grid/grid-state.svelte.ts";
	import { t } from "#lib/i18n/index.ts";
	import { sentFilterKeysWithoutQuickFilter } from "./quick-filters";

	let {
		openFilters = $bindable(),
	}: { openFilters: { all: boolean; age: boolean; position: boolean } } =
		$props();

	const chips = quickFilterChips();

	const filters = $derived(gridState.filters.current);
	const { ageEnabled, positionEnabled } = $derived(filters);
	const sheetOnlyFiltersSent = $derived(
		sentFilterKeysWithoutQuickFilter({
			filters,
			genderFilterFlag: genderFilterFlag(),
		}).length > 0,
	);
</script>

<QuickFilterButton
	active={sheetOnlyFiltersSent}
	label={t("browse.quickFilters.a11y.allFilters")}
	drawerOpen={openFilters.all}
	onclick={() => (openFilters.all = true)}
	{@attach chips.chip("all")}
>
	<SlidersHorizontalIcon />
</QuickFilterButton>
<QuickFilterButton
	active={ageEnabled}
	drawerOpen={openFilters.age}
	onclick={() => (openFilters.age = true)}
	{@attach chips.chip("age")}
>
	{t("common.filters.age.label")}
</QuickFilterButton>
<QuickFilterButton
	active={positionEnabled}
	drawerOpen={openFilters.position}
	onclick={() => (openFilters.position = true)}
	{@attach chips.chip("position")}
>
	{t("common.filters.position.label")}
</QuickFilterButton>
<div class="flex h-9 w-fit items-center">
	<QuickFilterToggle
		bind:pressed={
			() => filters.isOnline,
			(isOnline) => gridState.filters.set({ isOnline })
		}
		{@attach chips.chip("online")}
	>
		{t("common.filters.online")}
	</QuickFilterToggle>
	<QuickFilterToggle
		bind:pressed={
			() => filters.isRightNow,
			(isRightNow) => gridState.filters.set({ isRightNow })
		}
		{@attach chips.chip("rightNow")}
	>
		{t("common.filters.rightNow")}
	</QuickFilterToggle>
	<QuickFilterToggle
		bind:pressed={
			() => filters.isFresh,
			(isFresh) => gridState.filters.set({ isFresh })
		}
		{@attach chips.chip("fresh")}
	>
		{t("common.filters.fresh")}
	</QuickFilterToggle>
</div>

<AgeQuickFilter bind:open={openFilters.age} filters={gridState.filters} />
<PositionQuickFilter
	bind:open={openFilters.position}
	filters={gridState.filters}
/>
