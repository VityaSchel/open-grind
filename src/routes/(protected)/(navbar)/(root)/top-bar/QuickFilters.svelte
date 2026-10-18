<script lang="ts">
	import SlidersHorizontalIcon from "phosphor-svelte/lib/SlidersHorizontalIcon";

	import { genderFilterFlag } from "$lib/api/feature-flags-state.svelte";
	import QuickFilterButton from "$lib/components/filters/QuickFilterButton.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { defaultFilters } from "$lib/model/browse/grid/filters";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";
	import { sentFilterKeysWithoutQuickFilter } from "./quick-filters";

	let {
		openFilters = $bindable(),
	}: { openFilters: { all: boolean; age: boolean; position: boolean } } =
		$props();

	const TOGGLE_FILTER_KEYS = ["isOnline", "isRightNow", "isFresh"] as const;

	const filters = $derived(gridState.filters.value ?? defaultFilters);
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
	label="All filters"
	onclick={() => (openFilters.all = true)}
>
	<SlidersHorizontalIcon />
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
		Online
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isRightNow"
		class={buttonVariants({ variant: "secondary" })}
	>
		Right now
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isFresh"
		class={buttonVariants({ variant: "secondary" })}
	>
		Fresh
	</ToggleGroup.Item>
</ToggleGroup.Root>

<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
