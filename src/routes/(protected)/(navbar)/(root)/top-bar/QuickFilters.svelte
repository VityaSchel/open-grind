<script lang="ts">
	import { SlidersHorizontalIcon } from "phosphor-svelte";

	import QuickFilterButton from "$lib/components/filters/QuickFilterButton.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { t } from "$lib/i18n";
	import { defaultFilters } from "$lib/model/browse/grid/filters";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";

	let {
		openFilters = $bindable(),
	}: { openFilters: { all: boolean; age: boolean; position: boolean } } =
		$props();

	const TOGGLE_FILTER_KEYS = ["isOnline", "isRightNow", "isFresh"] as const;

	const filters = $derived(gridState.filters.value ?? defaultFilters);
	const { ageEnabled, positionEnabled } = $derived(filters);
</script>

<Button
	variant="secondary"
	aria-label={t("browse.quickFilters.a11y.allFilters")}
	onclick={() => (openFilters.all = true)}
>
	<SlidersHorizontalIcon />
</Button>
<QuickFilterButton active={ageEnabled} onclick={() => (openFilters.age = true)}>
	{t("browse.filters.age.label")}
</QuickFilterButton>
<QuickFilterButton
	active={positionEnabled}
	onclick={() => (openFilters.position = true)}
>
	{t("common.filters.position.label")}
</QuickFilterButton>
<ToggleGroup.Root
	type="multiple"
	variant="default"
	bind:value={
		() => TOGGLE_FILTER_KEYS.filter((key) => filters[key]),
		(values: (typeof TOGGLE_FILTER_KEYS)[number][]) => {
			gridState.filters.set({
				isOnline: values.includes("isOnline"),
				isRightNow: values.includes("isRightNow"),
				isFresh: values.includes("isFresh"),
			});
		}
	}
	size="sm"
	class="h-9"
>
	<ToggleGroup.Item
		value="isOnline"
		class={buttonVariants({ variant: "secondary" })}
	>
		{t("common.filters.online")}
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isRightNow"
		class={buttonVariants({ variant: "secondary" })}
	>
		{t("common.filters.rightNow")}
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isFresh"
		class={buttonVariants({ variant: "secondary" })}
	>
		{t("browse.filters.fresh")}
	</ToggleGroup.Item>
</ToggleGroup.Root>

<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
