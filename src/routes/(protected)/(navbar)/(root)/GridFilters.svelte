<script lang="ts">
	import { untrack } from "svelte";

	import AgeFilter from "$lib/components/filters/age/AgeFilterField.svelte";
	import FilterBoolean from "$lib/components/filters/FilterBoolean.svelte";
	import GendersFilter from "$lib/components/filters/GendersFilter.svelte";
	import HeightFilter from "$lib/components/filters/HeightFilter.svelte";
	import { optionFilters } from "$lib/components/filters/option-filters";
	import OptionFilter from "$lib/components/filters/OptionFilter.svelte";
	import PhotosFilter from "$lib/components/filters/PhotosFilter.svelte";
	import PositionFilter from "$lib/components/filters/position/PositionFilterField.svelte";
	import TagsFilter from "$lib/components/filters/TagsFilter.svelte";
	import WeightFilter from "$lib/components/filters/WeightFilter.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Sheet from "$lib/components/ui/sheet";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let { open = $bindable() }: { open: boolean } = $props();

	let filters = $state(gridState.filters.snapshot());

	$effect(() => {
		if (open) {
			filters = untrack(() => gridState.filters.snapshot());
		}
	});

	let contentScroll = $state(0);

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

{#snippet col1()}
	<FilterBoolean id="favorite" bind:checked={filters.isFavorite}>
		Favorites
	</FilterBoolean>
	<FilterBoolean id="online" bind:checked={filters.isOnline}>
		Online
	</FilterBoolean>
	<FilterBoolean id="right-now" bind:checked={filters.isRightNow}>
		Right now
	</FilterBoolean>
	<AgeFilter bind:checked={filters.ageEnabled} bind:value={filters.age} />
	<GendersFilter
		bind:checked={filters.genderEnabled}
		bind:value={filters.genders}
	/>
{/snippet}
{#snippet col2()}
	<PositionFilter
		bind:checked={filters.positionEnabled}
		bind:value={filters.positions}
	/>
	<PhotosFilter
		bind:checked={filters.photosEnabled}
		bind:value={filters.photos}
	/>
	<TagsFilter bind:checked={filters.tagsEnabled} bind:value={filters.tags} />
{/snippet}
{#snippet col3()}
	<OptionFilter
		filter={optionFilters.tribes}
		bind:checked={filters.tribesEnabled}
		bind:value={filters.tribes}
	/>
	<OptionFilter
		filter={optionFilters.bodyTypes}
		bind:checked={filters.bodyTypesEnabled}
		bind:value={filters.bodyTypes}
	/>
	<HeightFilter
		bind:checked={filters.heightEnabled}
		bind:value={filters.height}
	/>
	<WeightFilter
		bind:checked={filters.weightEnabled}
		bind:value={filters.weight}
	/>
	<OptionFilter
		filter={optionFilters.relationshipStatuses}
		bind:checked={filters.relationshipStatusesEnabled}
		bind:value={filters.relationshipStatuses}
	/>
	<OptionFilter
		filter={optionFilters.acceptNSFWPics}
		bind:checked={filters.acceptNSFWPicsEnabled}
		bind:value={filters.acceptNSFWPics}
	/>
	<OptionFilter
		filter={optionFilters.lookingFor}
		bind:checked={filters.lookingForEnabled}
		bind:value={filters.lookingFor}
	/>
	<OptionFilter
		filter={optionFilters.meetAt}
		bind:checked={filters.meetAtEnabled}
		bind:value={filters.meetAt}
	/>
	<FilterBoolean
		id="havent-chatted-today"
		bind:checked={filters.haventChattedTodayEnabled}
	>
		Haven't chatted today
	</FilterBoolean>
	<OptionFilter
		filter={optionFilters.healthPractices}
		bind:checked={filters.healthPracticesEnabled}
		bind:value={filters.healthPractices}
	/>
{/snippet}
<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="mt-(--safe-area-top) mb-(--safe-area-bottom) max-h-screen-safe"
	>
		<Sheet.Header
			class={[
				"border border-x-0 border-t-0 border-transparent p-4 transition-colors",
				{ "border-muted": contentScroll > 0 },
			]}
		>
			<Sheet.Title>Filters</Sheet.Title>
		</Sheet.Header>
		<div
			class="flex max-h-full min-h-0 w-full flex-1 shrink gap-4 overflow-auto px-4 py-1 pb-4 *:flex-1 *:flex-col *:gap-4 **:break-inside-avoid max-lg:flex-col lg:gap-12"
			onscroll={(event) => {
				if (event.target instanceof HTMLDivElement) {
					contentScroll =
						event.target.scrollTop /
						(event.target.scrollHeight - event.target.clientHeight);
				}
			}}
		>
			<div class="flex max-w-full">
				{@render col1()}
			</div>
			<div class="flex max-w-full">
				{@render col2()}
			</div>
			<div class="flex max-w-full">
				{@render col3()}
			</div>
		</div>
		<Sheet.Footer
			class={[
				"border border-x-0 border-b-0 border-transparent p-4 transition-colors sm:items-end",
				{ "border-muted": contentScroll < 1 },
			]}
		>
			<Button
				type="submit"
				onclick={() => {
					gridState.filters.set(filters);
					open = false;
				}}
			>
				Apply
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
